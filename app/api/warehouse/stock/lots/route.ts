import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { LOT_ORDER_SQL } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// GET /api/warehouse/stock/lots?item_id=123 — 품목의 현재 로트 (로그인)
//
// 재고 조정 화면이 "지금 몇 개인지"를 불러올 때 쓴다.
// 정렬은 차감 순서 그대로(소비기한 빠른 순 → 입고일 순).
// 수량 0/음수 로트도 포함한다 — 조정으로 되돌릴 대상이기 때문.
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const itemId = Number(new URL(request.url).searchParams.get("item_id"));
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "품목을 선택하세요." }, { status: 400 });
    }

    const res = await query(
      `SELECT id, quantity,
              expiry_date::text   AS expiry_date,
              received_date::text AS received_date
         FROM item_lots
        WHERE item_id = $1
        ${LOT_ORDER_SQL}`,
      [itemId]
    );
    return NextResponse.json({ lots: res.rows });
  } catch (e) {
    console.error("로트 조회 실패:", e);
    return NextResponse.json(
      { error: "재고를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
