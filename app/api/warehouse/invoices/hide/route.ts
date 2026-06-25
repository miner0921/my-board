import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

// POST /api/warehouse/invoices/hide  (로그인한 작업자 전원)
// body: { ids: number[], restore?: boolean }
//   restore=false(기본): 삭제 (deleted_at=now) — soft delete
//   restore=true       : 복구 (deleted_at=NULL)
// ⚠️ 완전삭제가 아니라 soft delete — scan_logs(검수기록)/invoice_items 등 자식 데이터는
//    절대 삭제하지 않는다. hard delete 경로는 두지 않는다.
export async function POST(request: Request) {
  const r = await requireUser();
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
          WHERE id = ANY($1::int[]) AND deleted_at IS NOT NULL
          RETURNING id`,
        [ids]
      )
    : await query(
        `UPDATE invoices
            SET deleted_at = NOW(), deleted_by = $2
          WHERE id = ANY($1::int[]) AND deleted_at IS NULL
          RETURNING id`,
        [ids, userId]
      );

  // 실제로 바뀐 건만 누가·언제·무엇을 기록(감사 추적). targetId로 송장 id 명시.
  for (const row of result.rows) {
    await logAccess({
      session: r.session,
      action: restore ? "invoice.restore" : "invoice.hide",
      targetType: "invoice",
      targetId: row.id,
      request,
    });
  }

  return NextResponse.json({ ok: true, affected: result.rowCount ?? 0 });
}
