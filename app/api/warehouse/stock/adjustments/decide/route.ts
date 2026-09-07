import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { setLotQuantity } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/stock/adjustments/decide — 조정 요청 승인/반려 (관리자)
// body: { ids: number[], action: 'approve'|'reject', memo? }
//
// 승인해야 비로소 재고가 움직인다(요청 시점엔 장부를 건드리지 않았다).
// 반영은 "그 로트를 after_quantity 개로 맞춘다" — 요청 이후 입출고가 있었어도
// 승인 시점 잔량 기준으로 차이만큼만 움직인다(before_quantity 는 요청 당시 스냅샷일 뿐).
// 전부 한 트랜잭션. 이미 처리된 건은 조용히 건너뛴다(두 번 눌러도 이중 반영 없음).
// ─────────────────────────────────────────────────────────────

const MAX_IDS = 200;

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { session, userId } = auth;

    const body = await request.json().catch(() => ({}));
    const action =
      body.action === "approve" || body.action === "reject" ? body.action : null;
    if (!action) {
      return NextResponse.json(
        { error: "승인 또는 반려만 가능합니다." },
        { status: 400 }
      );
    }
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((v: unknown) => Number(v))
      .filter((n: number) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "처리할 요청을 선택하세요." },
        { status: 400 }
      );
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_IDS}건까지 처리할 수 있습니다.` },
        { status: 400 }
      );
    }
    const memoRaw = typeof body.memo === "string" ? body.memo.trim() : "";
    const memo = memoRaw === "" ? null : memoRaw.slice(0, 200);

    const done = await withTransaction(async (client) => {
      // 대기중인 것만 잠그고 처리한다 — 동시에 두 관리자가 눌러도 한 번만 반영된다.
      const rows = await client.query(
        `SELECT id, item_id, lot_id, after_quantity,
                expiry_date::text   AS expiry_date,
                received_date::text AS received_date,
                reason
           FROM item_stock_adjustments
          WHERE id = ANY($1::int[]) AND status = 'pending'
          ORDER BY id
          FOR UPDATE`,
        [ids]
      );

      for (const r of rows.rows) {
        if (action === "approve") {
          await setLotQuantity(client, {
            itemId: Number(r.item_id),
            lotId: r.lot_id === null ? null : Number(r.lot_id),
            expiryDate: r.expiry_date,
            receivedDate: r.received_date,
            target: Number(r.after_quantity),
            memo: r.reason,
            userId,
          });
        }
        await client.query(
          `UPDATE item_stock_adjustments
              SET status = $2::text, decided_by = $3, decided_at = NOW(),
                  decide_memo = $4
            WHERE id = $1`,
          [r.id, action === "approve" ? "approved" : "rejected", userId, memo]
        );
      }

      return rows.rows.length;
    });

    await logAccess({
      session,
      action: action === "approve" ? "stock.adjust.approve" : "stock.adjust.reject",
      targetType: "stock_adjustment",
      targetId: ids[0],
      request,
    });
    revalidatePath("/warehouse/stock");
    revalidatePath("/warehouse/stock/adjustments");

    const label = action === "approve" ? "승인" : "반려";
    return NextResponse.json({
      decided: done,
      message:
        done === 0
          ? "이미 처리된 요청입니다."
          : `${done}건 ${label}했습니다.${
              done < ids.length ? ` (${ids.length - done}건은 이미 처리됨)` : ""
            }`,
    });
  } catch (e) {
    console.error("재고 조정 승인/반려 실패:", e);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
