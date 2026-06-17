import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

// POST /api/warehouse/invoices/hide  (관리자 전용)
// body: { ids: number[], restore?: boolean }
//   restore=false(기본): 숨김 (deleted_at=now)
//   restore=true       : 복구 (deleted_at=NULL)
// ⚠️ 완전삭제가 아니라 숨김 — scan_logs(검수기록)/invoice_items 등 자식 데이터는
//    절대 삭제하지 않는다.
export async function POST(request: Request) {
  const r = await requireAdmin();
  if (!r.ok) return r.response;

  const body = await request.json().catch(() => ({}));
  const restore = body?.restore === true;
  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids
        .map((v: unknown) => Number(v))
        .filter((n: number) => Number.isInteger(n) && n > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "대상 송장을 선택해주세요." },
      { status: 400 }
    );
  }

  const userId = Number(r.session.user.id);
  const result = restore
    ? await query(
        `UPDATE invoices
            SET deleted_at = NULL, deleted_by = NULL
          WHERE id = ANY($1::int[]) AND deleted_at IS NOT NULL`,
        [ids]
      )
    : await query(
        `UPDATE invoices
            SET deleted_at = NOW(), deleted_by = $2
          WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
        [ids, userId]
      );

  await logAccess({
    session: r.session,
    action: restore ? "invoice.restore" : "invoice.hide",
    targetType: "invoice",
    request,
  });

  return NextResponse.json({ ok: true, affected: result.rowCount ?? 0 });
}
