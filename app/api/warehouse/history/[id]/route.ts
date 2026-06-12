import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/warehouse/history/[id]
// 완료된 송장의 검수 상세 + 품목 + 스캔 기록(scan_logs). 로그인 필수.
export async function GET(_request: Request, { params }: RouteContext) {
  const r = await requireUser();
  if (!r.ok) return r.response;

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) {
    return NextResponse.json(
      { error: "잘못된 송장 ID입니다." },
      { status: 400 }
    );
  }

  const [invResult, itemsResult, logsResult] = await Promise.all([
    query(
      `SELECT
         i.id, i.invoice_no, i.order_no, i.status,
         i.recipient_name, i.customer_type,
         i.created_at, i.scan_started_at, i.completed_at,
         i.completion_reason, i.completion_note,
         uc.nickname AS created_by_name,
         us.nickname AS scan_started_by_name,
         uo.nickname AS completed_by_name,
         COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
         COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
       FROM invoices i
       LEFT JOIN users uc          ON i.created_by      = uc.id
       LEFT JOIN users us          ON i.scan_started_by = us.id
       LEFT JOIN users uo          ON i.completed_by    = uo.id
       LEFT JOIN invoice_items ii  ON ii.invoice_id     = i.id
       WHERE i.id = $1
       GROUP BY i.id, uc.nickname, us.nickname, uo.nickname`,
      [invoiceId]
    ),
    query(
      `SELECT
         ii.id AS invoice_item_id,
         ii.item_id, ii.quantity, ii.scanned_count, ii.display_name,
         ii.is_added_on_scan,
         it.name, it.barcode, it.updated_at,
         (it.image_data IS NOT NULL) AS has_image
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id`,
      [invoiceId]
    ),
    query(
      `SELECT s.id, s.scanned_at, s.is_error, s.error_reason, s.item_id,
              it.name AS item_name, it.barcode AS item_barcode,
              s.user_id, u.nickname AS user_name
         FROM scan_logs s
         LEFT JOIN items it ON s.item_id = it.id
         LEFT JOIN users u  ON s.user_id = u.id
        WHERE s.invoice_id = $1
        ORDER BY s.scanned_at ASC, s.id ASC`,
      [invoiceId]
    ),
  ]);

  if (invResult.rows.length === 0) {
    return NextResponse.json(
      { error: "송장을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    invoice: invResult.rows[0],
    items: itemsResult.rows,
    scan_logs: logsResult.rows,
  });
}
