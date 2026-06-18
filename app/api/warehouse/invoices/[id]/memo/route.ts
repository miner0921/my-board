import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_MEMO_LEN = 1000;

// PUT: 송장 관리자 메모(admin_memo) 저장 (관리자만).
// 작업자는 스캔 화면에서 보기만 — 입력/수정은 관리자 전용.
// 빈 값은 NULL 로 저장(메모 제거).
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const authz = await requireAdmin();
    if (!authz.ok) return authz.response;

    const { id } = await params;
    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId)) {
      return NextResponse.json(
        { error: "잘못된 송장 ID입니다." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const memoRaw = typeof body?.memo === "string" ? body.memo.trim() : "";
    if (memoRaw.length > MAX_MEMO_LEN) {
      return NextResponse.json(
        { error: `메모는 ${MAX_MEMO_LEN}자 이하여야 합니다.` },
        { status: 400 }
      );
    }
    const memo: string | null = memoRaw.length > 0 ? memoRaw : null;

    const res = await query(
      `UPDATE invoices SET admin_memo = $1
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING id, admin_memo`,
      [memo, invoiceId]
    );
    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session: authz.session,
      action: "invoice.memo_update",
      targetType: "invoice",
      targetId: invoiceId,
      request,
    });

    return NextResponse.json({
      admin_memo: res.rows[0].admin_memo,
      message: "메모가 저장되었습니다.",
    });
  } catch (error) {
    console.error("송장 메모 저장 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
