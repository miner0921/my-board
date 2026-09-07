import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireUser } from "@/lib/auth-helper";
import { setLotQuantity, toDateStr } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/stock/adjustments — 재고 조정 등록 (로그인 전원)
// body: {
//   reason,
//   lines: [{ item_id, lot_id?, expiry_date?, received_date?, after_quantity }]
// }
//
// 입출고와는 별개 기능 — 장부와 실물이 어긋났을 때의 정정이라 사유가 필수다.
// 한 줄 = 한 로트(품목+소비기한)를 "몇 개로 만든다"(050).
//   관리자      : 바로 반영(approved 로 저장 + 로트 수량 맞춤)
//   일반 작업자 : pending 으로만 저장. 관리자가 승인해야 재고가 움직인다.
// before_quantity 는 서버가 지금 잔량을 직접 읽어 저장한다(클라이언트 값 신뢰 안 함).
// 지금 잔량과 목표가 같은 줄은 조용히 건너뛴다(바꿀 게 없음).
// 전부 한 트랜잭션 — 한 줄이라도 실패하면 전체 롤백.
// ─────────────────────────────────────────────────────────────

const MAX_LINES = 200;

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { session, userId, role } = auth;
    const isAdmin = role === "admin";

    const body = await request.json().catch(() => ({}));
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reasonRaw === "") {
      return NextResponse.json(
        { error: "조정 사유를 입력하세요." },
        { status: 400 }
      );
    }
    const reason = reasonRaw.slice(0, 200);

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines: {
      itemId: number;
      lotId: number | null;
      expiry: string | null;
      received: string | null;
      after: number;
    }[] = [];
    for (const r of rawLines) {
      const itemId = Number(r?.item_id);
      const after = Number(r?.after_quantity);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return NextResponse.json({ error: "품목을 선택하세요." }, { status: 400 });
      }
      if (!Number.isInteger(after) || after < 0) {
        return NextResponse.json(
          { error: "변경할 수량은 0 이상의 정수여야 합니다." },
          { status: 400 }
        );
      }
      if (r?.expiry_date && !toDateStr(r.expiry_date)) {
        return NextResponse.json(
          { error: "소비기한 형식이 올바르지 않습니다 (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
      // ⚠️ Number(null) === 0 이라 그냥 isInteger 로 거르면 새 로트가 lot_id=0 이 된다(FK 위반).
      //    양수일 때만 기존 로트로 본다.
      const lotId = Number(r?.lot_id);
      lines.push({
        itemId,
        lotId: Number.isInteger(lotId) && lotId > 0 ? lotId : null,
        expiry: toDateStr(r?.expiry_date),
        received: toDateStr(r?.received_date),
        after,
      });
    }
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "조정할 품목을 1개 이상 추가하세요." },
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
        if (!item) return { kind: "not_found" as const, saved: 0 };
        // 소비기한 관리 품목은 새 로트를 만들 때 소비기한이 있어야 한다.
        if (item.expiryManaged && l.lotId === null && !l.expiry) {
          return { kind: "expiry_required" as const, name: item.name, saved: 0 };
        }
      }

      let saved = 0;
      for (const l of lines) {
        // 지금 잔량 — 로트 id 우선, 없으면 (품목, 소비기한, 입고일) 키로.
        const cur =
          l.lotId !== null
            ? await client.query(
                `SELECT quantity FROM item_lots WHERE id = $1 AND item_id = $2`,
                [l.lotId, l.itemId]
              )
            : await client.query(
                `SELECT quantity FROM item_lots
                  WHERE item_id = $1
                    AND COALESCE(expiry_date, DATE '0001-01-01')
                        = COALESCE($2::date, DATE '0001-01-01')
                    AND received_date = COALESCE($3::date, CURRENT_DATE)`,
                [l.itemId, l.expiry, l.received]
              );
        const before = Number(cur.rows[0]?.quantity ?? 0);
        if (before === l.after) continue; // 바꿀 게 없는 줄

        if (isAdmin) {
          await setLotQuantity(client, {
            itemId: l.itemId,
            lotId: l.lotId,
            expiryDate: l.expiry,
            receivedDate: l.received,
            target: l.after,
            memo: reason,
            userId,
          });
        }

        await client.query(
          `INSERT INTO item_stock_adjustments
             (item_id, lot_id, expiry_date, received_date,
              before_quantity, after_quantity, reason,
              status, requested_by, decided_by, decided_at)
           VALUES ($1, $2, $3::date, $4::date, $5, $6, $7,
                   $8::text, $9, $10,
                   CASE WHEN $8::text = 'approved' THEN NOW() ELSE NULL END)`,
          [
            l.itemId,
            l.lotId,
            l.expiry,
            l.received,
            before,
            l.after,
            reason,
            isAdmin ? "approved" : "pending",
            userId,
            isAdmin ? userId : null,
          ]
        );
        saved += 1;
      }

      return { kind: "ok" as const, saved };
    });

    if (result.kind === "not_found") {
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
    if (result.saved === 0) {
      return NextResponse.json(
        { error: "현재 재고와 같아 바뀔 내용이 없습니다." },
        { status: 400 }
      );
    }

    await logAccess({
      session,
      action: isAdmin ? "stock.adjust.apply" : "stock.adjust.request",
      targetType: "item",
      targetId: lines[0].itemId,
      request,
    });
    revalidatePath("/warehouse/stock");
    revalidatePath("/warehouse/stock/adjustments");

    return NextResponse.json({
      saved: result.saved,
      applied: isAdmin,
      message: isAdmin
        ? `${result.saved}건 조정 반영했습니다.`
        : `${result.saved}건 조정을 요청했습니다. 관리자 승인 후 반영됩니다.`,
    });
  } catch (e) {
    console.error("재고 조정 등록 실패:", e);
    return NextResponse.json(
      { error: "조정 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
