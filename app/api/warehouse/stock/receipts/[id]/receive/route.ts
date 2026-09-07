import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireUser } from "@/lib/auth-helper";
import { receiveStock, toDateStr } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/stock/receipts/[id]/receive — 현장 입고 등록 (로그인 작업자)
// body: { items: [{ receipt_item_id?, item_id, quantity, expiry_date?, received_date? }] }
//
// 현장에서 실물 보고 여러 줄을 한 번에 등록한다(선택 항목 입고 / 전체 입고).
// 전부 한 트랜잭션 — 한 줄이라도 실패하면 전체 롤백.
// 같은 품목을 소비기한별로 나눠 등록해도 정상(각각 다른 로트가 된다).
// 예정에 없던 품목이 섞여 와도 등록을 막지 않는다(예정 0으로 줄을 추가).
//
// 어느 줄에 기록할지(048 — 줄 키 = 입고증+품목+소비기한):
//   1) 입력한 소비기한과 같은 줄이 이미 있으면 그 줄
//   2) 없고, 보낸 receipt_item_id 줄이 아직 입고 전(received 0)이면 그 줄의 소비기한을
//      실제 값으로 고쳐서 그 줄  ← "예정을 현장 실물에 맞춰 수정"
//   3) 그 외에는 새 줄(예정 0)
//
// 등록이 끝나면 입고증 상태를 다시 계산한다(수동 "입고 완료" 버튼 없음):
//   예정 수량을 전부 채웠으면 received, 일부만 채웠으면 partial, 아직 0이면 open.
// ─────────────────────────────────────────────────────────────

const MAX_LINES = 200;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { session, userId } = auth;

    const { id } = await params;
    const receiptId = Number(id);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return NextResponse.json(
        { error: "잘못된 입고증입니다." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const lines: {
      lineId: number | null;
      itemId: number;
      quantity: number;
      expiry: string | null;
      received: string | null;
    }[] = [];
    for (const r of rawItems) {
      const itemId = Number(r?.item_id);
      const quantity = Number(r?.quantity);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return NextResponse.json({ error: "품목을 선택하세요." }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "수량은 1 이상의 정수여야 합니다." },
          { status: 400 }
        );
      }
      if (r?.expiry_date && !toDateStr(r.expiry_date)) {
        return NextResponse.json(
          { error: "소비기한 형식이 올바르지 않습니다 (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
      // Number(null) === 0 이므로 양수일 때만 기존 줄로 본다.
      const lineId = Number(r?.receipt_item_id);
      lines.push({
        lineId: Number.isInteger(lineId) && lineId > 0 ? lineId : null,
        itemId,
        quantity,
        expiry: toDateStr(r?.expiry_date),
        received: toDateStr(r?.received_date),
      });
    }
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "입고할 항목을 1개 이상 선택하세요." },
        { status: 400 }
      );
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_LINES}줄까지 처리할 수 있습니다.` },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const rec = await client.query(
        `SELECT id, status FROM stock_receipts
          WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [receiptId]
      );
      if (rec.rows.length === 0) return { kind: "not_found" as const };
      if (rec.rows[0].status === "canceled") {
        return { kind: "canceled" as const };
      }

      const found = await client.query(
        `SELECT id, name, expiry_managed FROM items
          WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
        [[...new Set(lines.map((l) => l.itemId))]]
      );
      const items = new Map<number, { name: string; expiryManaged: boolean }>(
        found.rows.map((r) => [
          Number(r.id),
          { name: r.name as string, expiryManaged: r.expiry_managed as boolean },
        ])
      );

      for (const l of lines) {
        const item = items.get(l.itemId);
        if (!item) return { kind: "bad_item" as const };
        if (item.expiryManaged && !l.expiry) {
          return { kind: "expiry_required" as const, name: item.name };
        }
      }

      for (const l of lines) {
        await receiveStock(client, {
          itemId: l.itemId,
          quantity: l.quantity,
          expiryDate: l.expiry,
          receivedDate: l.received,
          receiptId,
          userId,
        });

        // 1) 같은 소비기한의 줄이 이미 있으면 그 줄에 누적
        const same = await client.query(
          `SELECT id FROM stock_receipt_items
            WHERE receipt_id = $1 AND item_id = $2
              AND expiry_date IS NOT DISTINCT FROM $3::date`,
          [receiptId, l.itemId, l.expiry]
        );
        let targetId: number | null = same.rows[0]?.id ?? null;

        // 2) 아직 입고 전인 예정 줄이면 소비기한을 실제 값으로 고쳐 쓴다
        if (targetId === null && l.lineId !== null) {
          const planned = await client.query(
            `SELECT id FROM stock_receipt_items
              WHERE id = $1 AND receipt_id = $2 AND item_id = $3
                AND received_quantity = 0`,
            [l.lineId, receiptId, l.itemId]
          );
          if (planned.rows.length > 0) {
            targetId = Number(planned.rows[0].id);
            await client.query(
              `UPDATE stock_receipt_items SET expiry_date = $2::date WHERE id = $1`,
              [targetId, l.expiry]
            );
          }
        }

        // 3) 그래도 없으면 새 줄(예정 0)
        if (targetId === null) {
          await client.query(
            `INSERT INTO stock_receipt_items
               (receipt_id, item_id, expiry_date, planned_quantity, received_quantity)
             VALUES ($1, $2, $3::date, 0, $4)`,
            [receiptId, l.itemId, l.expiry, l.quantity]
          );
        } else {
          await client.query(
            `UPDATE stock_receipt_items
                SET received_quantity = received_quantity + $2
              WHERE id = $1`,
            [targetId, l.quantity]
          );
        }
      }

      // 예정 대비 얼마나 채웠는지로 상태를 자동 결정한다.
      const st = await client.query(
        `UPDATE stock_receipts r
            SET status      = s.next,
                received_at = CASE WHEN s.next = 'received' THEN NOW() ELSE NULL END,
                received_by = CASE WHEN s.next = 'received' THEN $2::int ELSE NULL END
           FROM (
             SELECT CASE
                      WHEN COUNT(*) FILTER (
                             WHERE ri.received_quantity < ri.planned_quantity
                           ) = 0 THEN 'received'
                      WHEN COALESCE(SUM(ri.received_quantity), 0) > 0 THEN 'partial'
                      ELSE 'open'
                    END AS next
               FROM stock_receipt_items ri
              WHERE ri.receipt_id = $1
           ) s
          WHERE r.id = $1
          RETURNING r.status`,
        [receiptId, userId]
      );

      return {
        kind: "ok" as const,
        name: items.get(lines[0].itemId)!.name,
        status: st.rows[0]?.status as string,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "입고증을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "canceled") {
      return NextResponse.json(
        { error: "취소된 입고증입니다." },
        { status: 409 }
      );
    }
    if (result.kind === "bad_item") {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "expiry_required") {
      return NextResponse.json(
        {
          error: `${result.name} — 소비기한 관리 대상입니다. 소비기한을 입력하세요.`,
        },
        { status: 400 }
      );
    }

    await logAccess({
      session,
      action: "stock.receipt.receive",
      targetType: "stock_receipt",
      targetId: receiptId,
      request,
    });
    revalidatePath("/warehouse/stock");
    revalidatePath(`/warehouse/stock/receipts/${receiptId}`);

    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    const head =
      lines.length === 1
        ? `${result.name} ${totalQty}개 입고`
        : `${lines.length}줄 ${totalQty}개 입고`;
    return NextResponse.json({
      status: result.status,
      message:
        result.status === "received"
          ? `${head} — 예정 수량을 다 채워 입고 완료 처리했습니다.`
          : head,
    });
  } catch (e) {
    console.error("현장 입고 실패:", e);
    return NextResponse.json(
      { error: "입고 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
