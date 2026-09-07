import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin, requireUser } from "@/lib/auth-helper";
import { loadReceipt } from "@/lib/stock-receipt";

// ─────────────────────────────────────────────────────────────
// GET    /api/warehouse/stock/receipts/[id]  — 입고증 상세 (로그인)
// PATCH  ...                                  — 입고 완료 / 다시 열기 (로그인 작업자)
// DELETE ...                                  — 입고증 취소 = soft delete (관리자)
//
// 입고 자체는 [id]/receive 에서 한다. 여기 PATCH 는 "다 끝났다" 표시만 바꾼다.
// (재고에는 영향 없음 — 이미 등록된 로트는 그대로다)
// ─────────────────────────────────────────────────────────────

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const receiptId = parseId(id);
    if (!receiptId) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const full = await loadReceipt({ id: receiptId });
    if (!full) {
      return NextResponse.json(
        { error: "입고증을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json(full);
  } catch (e) {
    console.error("입고증 조회 실패:", e);
    return NextResponse.json(
      { error: "입고증 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { session, userId } = auth;

    const { id } = await params;
    const receiptId = parseId(id);
    if (!receiptId) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const status = body.status === "received" || body.status === "open" ? body.status : null;
    if (!status) {
      return NextResponse.json(
        { error: "status 는 received 또는 open 이어야 합니다." },
        { status: 400 }
      );
    }

    const upd = await query(
      // $1 을 varchar 컬럼 대입과 문자열 비교 양쪽에 쓰면 PG 가 타입을 못 정한다
      // (inconsistent types deduced for parameter $1) — 전부 ::text 로 못박는다.
      `UPDATE stock_receipts
          SET status      = $1::text,
              received_at = CASE WHEN $1::text = 'received' THEN NOW() ELSE NULL END,
              received_by = CASE WHEN $1::text = 'received' THEN $2::int ELSE NULL END
        WHERE id = $3 AND deleted_at IS NULL AND status <> 'canceled'
        RETURNING id, status`,
      [status, userId, receiptId]
    );
    if (upd.rows.length === 0) {
      return NextResponse.json(
        { error: "입고증을 찾을 수 없거나 취소된 입고증입니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session,
      action: status === "received" ? "stock.receipt.close" : "stock.receipt.reopen",
      targetType: "stock_receipt",
      targetId: receiptId,
      request,
    });
    revalidatePath("/warehouse/stock/receipts");
    revalidatePath(`/warehouse/stock/receipts/${receiptId}`);

    return NextResponse.json({
      status: upd.rows[0].status,
      message: status === "received" ? "입고 완료 처리했습니다." : "다시 열었습니다.",
    });
  } catch (e) {
    console.error("입고증 상태 변경 실패:", e);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const { id } = await params;
    const receiptId = parseId(id);
    if (!receiptId) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    // soft delete — 이미 등록된 재고 로트는 건드리지 않는다(실물은 이미 들어왔으므로).
    const upd = await query(
      `UPDATE stock_receipts
          SET deleted_at = NOW(), status = 'canceled'
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [receiptId]
    );
    if (upd.rows.length === 0) {
      return NextResponse.json(
        { error: "입고증을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session,
      action: "stock.receipt.delete",
      targetType: "stock_receipt",
      targetId: receiptId,
      request,
    });
    revalidatePath("/warehouse/stock/receipts");

    return NextResponse.json({ message: "입고증을 취소했습니다." });
  } catch (e) {
    console.error("입고증 취소 실패:", e);
    return NextResponse.json(
      { error: "취소 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
