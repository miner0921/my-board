import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { isValidYm } from "@/lib/settlement";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/settlements/[ym]/confirm — 정산 확정 / 확정 해제 (관리자)
// body: { confirmed: boolean }
//
// 확정하면 행 수정·업로드·삭제가 전부 막힌다. 되돌리려면 여기서 해제.
// ─────────────────────────────────────────────────────────────

type Params = { params: Promise<{ ym: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { ym } = await params;
    if (!isValidYm(ym)) {
      return NextResponse.json({ error: "정산 월 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const confirmed = body?.confirmed === true;

    const res = await query(
      `UPDATE settlement_months
          SET status       = $1,
              confirmed_by = $2,
              confirmed_at = $3
        WHERE ym = $4
        RETURNING id`,
      [
        confirmed ? "confirmed" : "draft",
        confirmed ? auth.userId : null,
        confirmed ? new Date() : null,
        ym,
      ]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "정산 월을 찾을 수 없습니다." }, { status: 404 });
    }

    await logAccess({
      session: auth.session,
      action: confirmed ? "settlement_confirm" : "settlement_unconfirm",
      targetType: "settlement",
      targetId: res.rows[0].id,
      request,
    });
    revalidatePath("/warehouse/settlements");
    revalidatePath(`/warehouse/settlements/${ym}`);

    return NextResponse.json({ ok: true, confirmed });
  } catch (e) {
    console.error("정산 확정 처리 실패:", e);
    return NextResponse.json({ error: "처리하지 못했습니다." }, { status: 500 });
  }
}
