import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// DELETE /api/warehouse/invoices/[id]
// 관리자만. 자식 테이블(invoice_items / scan_logs / invoice_reopens) 모두 함께 삭제.
// body: { reason?: string } — 선택, audit 용도
export async function DELETE(request: Request, { params }: RouteContext) {
  const r = await requireAdmin();
  if (!r.ok) return r.response;

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) {
    return NextResponse.json(
      { error: "잘못된 송장 ID입니다." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reasonRaw =
    typeof body?.reason === "string" ? body.reason.trim() : "";
  const reason: string | null = reasonRaw.length > 0 ? reasonRaw : null;

  const result = await withTransaction(async (client) => {
    const invRes = await client.query(
      `SELECT id, invoice_no FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );
    if (invRes.rows.length === 0) {
      return { kind: "not_found" as const };
    }
    const invoiceNo = invRes.rows[0].invoice_no as string;

    // 자식 테이블 정리 — invoice_items는 ON DELETE CASCADE지만 명시적으로.
    await client.query(`DELETE FROM scan_logs WHERE invoice_id = $1`, [invoiceId]);
    await client.query(`DELETE FROM invoice_reopens WHERE invoice_id = $1`, [invoiceId]);
    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
    await client.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);

    return { kind: "ok" as const, invoiceNo };
  });

  if (result.kind === "not_found") {
    return NextResponse.json(
      { error: "송장을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  await logAccess({
    session: r.session,
    action: "invoice.deleted",
    targetType: "invoice",
    // 송장은 이미 삭제됨 — 참고용으로 id만 남김. reason은 메타 X (스키마 단순화)
    targetId: invoiceId,
    request,
  });

  // 사유는 access_logs에 별도 메타 컬럼이 없으므로 콘솔에만 (DB 변경 회피)
  if (reason) {
    console.info(
      `[invoice.deleted] id=${invoiceId} no=${result.invoiceNo} reason=${reason}`
    );
  }

  return NextResponse.json({
    ok: true,
    invoice_id: invoiceId,
    invoice_no: result.invoiceNo,
  });
}
