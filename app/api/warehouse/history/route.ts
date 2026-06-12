import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";

// GET /api/warehouse/history
// 완료된 검수(송장) 목록. 로그인 필수.
// 쿼리 파라미터(모두 선택):
//   q      — 송장번호 부분검색 (ILIKE)
//   worker — 완료자 user id (completed_by)
//   from   — 완료일 시작 (YYYY-MM-DD, 포함)
//   to     — 완료일 끝 (YYYY-MM-DD, 당일 포함)
export async function GET(request: Request) {
  const r = await requireUser();
  if (!r.ok) return r.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const worker = searchParams.get("worker") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

  const conditions: string[] = [
    `i.status IN ('completed', 'completed_partial')`,
    `i.completed_at IS NOT NULL`,
  ];
  const params: unknown[] = [];

  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(`i.invoice_no ILIKE $${params.length}`);
  }
  if (/^\d+$/.test(worker)) {
    params.push(Number(worker));
    conditions.push(`i.completed_by = $${params.length}`);
  }
  if (isDate(from)) {
    params.push(from);
    conditions.push(`i.completed_at >= $${params.length}::date`);
  }
  if (isDate(to)) {
    params.push(to);
    conditions.push(
      `i.completed_at < ($${params.length}::date + interval '1 day')`
    );
  }

  const result = await query(
    `SELECT i.id, i.invoice_no, i.status, i.completed_at, i.completion_reason,
            i.completed_by,
            uo.nickname AS completed_by_name,
            COALESCE(SUM(ii.quantity), 0)::int      AS total_qty,
            COALESCE(SUM(ii.scanned_count), 0)::int AS scanned_qty
       FROM invoices i
       LEFT JOIN users uo         ON i.completed_by = uo.id
       LEFT JOIN invoice_items ii ON ii.invoice_id  = i.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY i.id, uo.nickname
      ORDER BY i.completed_at DESC`,
    params
  );

  return NextResponse.json({ invoices: result.rows });
}
