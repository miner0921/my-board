import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { toDateStr } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/stock/receipts — 입고증 생성 (관리자)
// body: { title?, items: [{ item_id, expiry_date?, planned_quantity }] }
//
// 같은 품목이라도 소비기한이 다르면 다른 줄이다(048). 현장에선 이 값을 기본값으로 받아 고친다.
//
// receipt_no 는 INSERT 후 id 로 만든다('RC' + 7자리) — 채번 경합이 없다.
// 이 번호를 Code128 바코드로 인쇄해, 현장에서 스캔하면 예정 품목이 뜬다.
// ─────────────────────────────────────────────────────────────

const MAX_ITEMS = 500;

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { session, userId } = auth;

    const body = await request.json().catch(() => ({}));
    const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
    const title = titleRaw === "" ? null : titleRaw.slice(0, 200);

    const rawItems = Array.isArray(body.items) ? body.items : [];
    // (품목 + 소비기한)이 같은 줄이 둘이면 예정 수량을 합친다(UNIQUE 충돌 방지).
    const merged = new Map<
      string,
      { itemId: number; expiry: string | null; qty: number }
    >();
    for (const r of rawItems) {
      const id = Number(r?.item_id);
      const qty = Number(r?.planned_quantity);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (r?.expiry_date && !toDateStr(r.expiry_date)) {
        return NextResponse.json(
          { error: "소비기한 형식이 올바르지 않습니다 (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
      const expiry = toDateStr(r?.expiry_date);
      const q = Number.isInteger(qty) && qty > 0 ? qty : 0;
      const key = `${id}|${expiry ?? ""}`;
      const cur = merged.get(key);
      if (cur) cur.qty += q;
      else merged.set(key, { itemId: id, expiry, qty: q });
    }
    if (merged.size === 0) {
      return NextResponse.json(
        { error: "입고 예정 품목을 1개 이상 추가하세요." },
        { status: 400 }
      );
    }
    if (merged.size > MAX_ITEMS) {
      return NextResponse.json(
        { error: `품목은 ${MAX_ITEMS}개까지 담을 수 있습니다.` },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const itemIds = [...new Set([...merged.values()].map((v) => v.itemId))];
      const valid = await client.query(
        `SELECT id FROM items WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
        [itemIds]
      );
      if (valid.rows.length !== itemIds.length) {
        return { kind: "bad_item" as const };
      }

      const ins = await client.query(
        `INSERT INTO stock_receipts (title, created_by) VALUES ($1, $2) RETURNING id`,
        [title, userId]
      );
      const receiptId = Number(ins.rows[0].id);

      const upd = await client.query(
        `UPDATE stock_receipts SET receipt_no = 'RC' || LPAD($1::text, 7, '0')
          WHERE id = $1 RETURNING receipt_no`,
        [receiptId]
      );

      for (const line of merged.values()) {
        await client.query(
          `INSERT INTO stock_receipt_items (receipt_id, item_id, expiry_date, planned_quantity)
           VALUES ($1, $2, $3::date, $4)`,
          [receiptId, line.itemId, line.expiry, line.qty]
        );
      }

      return {
        kind: "ok" as const,
        id: receiptId,
        receiptNo: upd.rows[0].receipt_no as string,
      };
    });

    if (result.kind === "bad_item") {
      return NextResponse.json(
        { error: "존재하지 않거나 삭제된 품목이 포함돼 있습니다." },
        { status: 400 }
      );
    }

    await logAccess({
      session,
      action: "stock.receipt.create",
      targetType: "stock_receipt",
      targetId: result.id,
      request,
    });
    revalidatePath("/warehouse/stock/receipts");

    return NextResponse.json(
      { id: result.id, receipt_no: result.receiptNo, message: "입고증 생성 완료" },
      { status: 201 }
    );
  } catch (e) {
    console.error("입고증 생성 실패:", e);
    return NextResponse.json(
      { error: "입고증 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
