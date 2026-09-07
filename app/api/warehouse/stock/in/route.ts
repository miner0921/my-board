import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { receiveStock, toDateStr } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/stock/in — 수동 입고 (관리자)
// body: { items: [{ item_id, quantity, expiry_date?, received_date? }], memo? }
//
// 여러 품목을 한 번에 넣는다. 같은 품목이라도 소비기한이 다르면 줄을 나눠 보내면 된다.
// 전부 한 트랜잭션 — 한 줄이라도 실패하면 전체 롤백.
// 소비기한 관리 품목(items.expiry_managed)은 expiry_date 필수.
// ─────────────────────────────────────────────────────────────

const MAX_LINES = 200;

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { session, userId } = auth;

    const body = await request.json().catch(() => ({}));
    const memoRaw = typeof body.memo === "string" ? body.memo.trim() : "";
    const memo = memoRaw === "" ? null : memoRaw.slice(0, 200);

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const lines: {
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
      lines.push({
        itemId,
        quantity,
        expiry: toDateStr(r?.expiry_date),
        received: toDateStr(r?.received_date),
      });
    }
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "입고할 품목을 1개 이상 추가하세요." },
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
        if (!item) return { kind: "not_found" as const };
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
          memo,
          userId,
        });
      }

      return { kind: "ok" as const, name: items.get(lines[0].itemId)!.name };
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

    for (const l of lines) {
      await logAccess({
        session,
        action: "stock.in",
        targetType: "item",
        targetId: l.itemId,
        request,
      });
    }
    revalidatePath("/warehouse/stock");

    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    return NextResponse.json({
      message:
        lines.length === 1
          ? `${result.name} ${totalQty}개 입고 완료`
          : `${lines.length}줄 ${totalQty}개 입고 완료`,
    });
  } catch (e) {
    console.error("재고 입고 실패:", e);
    return NextResponse.json(
      { error: "입고 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
