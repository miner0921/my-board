import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanLine } from "lucide-react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { formatDateTime } from "../../invoices/_list";
import NewReceiptButton from "./NewReceiptButton";
import { RECEIPT_STATUS, RECEIPT_TABS } from "./_status";

// 입고증 목록. 사무실에서 예정 품목을 등록해 인쇄하고, 현장에서 바코드로 불러 입고한다.

const PAGE_SIZE = 30;

type Row = {
  id: number;
  receipt_no: string;
  title: string | null;
  status: string;
  created_at: string;
  nickname: string | null;
  line_count: number;
  planned_total: number;
  received_total: number;
};

type PageProps = {
  searchParams: Promise<{ status?: string; page?: string }>;
};

export default async function ReceiptsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const sp = await searchParams;
  // 탭 하나가 상태 여러 개를 담는다("입고 대기" = open + partial).
  const tab = RECEIPT_TABS[sp.status ?? ""] ? (sp.status as string) : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const params: unknown[] = [];
  const where = ["r.deleted_at IS NULL"];
  if (tab !== "") {
    params.push(RECEIPT_TABS[tab].statuses);
    where.push(`r.status = ANY($${params.length}::text[])`);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM stock_receipts r ${whereSql}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.min(page, totalPages) - 1) * PAGE_SIZE;

  const res = await query(
    `SELECT r.id, r.receipt_no, r.title, r.status, r.created_at,
            u.nickname,
            COUNT(ri.id)::int                          AS line_count,
            COALESCE(SUM(ri.planned_quantity), 0)::int  AS planned_total,
            COALESCE(SUM(ri.received_quantity), 0)::int AS received_total
       FROM stock_receipts r
       LEFT JOIN stock_receipt_items ri ON ri.receipt_id = r.id
       LEFT JOIN users u ON u.id = r.created_by
       ${whereSql}
      GROUP BY r.id, u.nickname
      ORDER BY r.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  );
  const rows = res.rows as Row[];

  const hrefWith = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams();
    if (tab) s.set("status", tab);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    const str = s.toString();
    return `/warehouse/stock/receipts${str ? `?${str}` : ""}`;
  };

  const linkBtn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition";

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/warehouse/stock" className={linkBtn}>
          ← 재고 현황
        </Link>
        <Link href="/warehouse/stock/receive" className={linkBtn}>
          <ScanLine size={16} strokeWidth={1.75} />
          현장 입고
        </Link>
        {isAdmin && (
          <div className="ml-auto">
            <NewReceiptButton />
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={hrefWith({ status: null, page: null })}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            tab === ""
              ? "bg-zinc-900 border-zinc-900 text-white"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          전체
        </Link>
        {Object.entries(RECEIPT_TABS).map(([key, { label }]) => (
          <Link
            key={key}
            href={hrefWith({ status: key, page: null })}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              tab === key
                ? "bg-zinc-900 border-zinc-900 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-auto text-sm text-zinc-500">총 {total}건</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-xl">
          입고증이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/warehouse/stock/receipts/${r.id}`}
              className="block border border-zinc-200 rounded-xl p-4 bg-white hover:bg-zinc-50 transition"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {r.receipt_no}
                    <span className="ml-2 font-normal text-zinc-500">
                      {r.title ?? "(제목 없음)"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDateTime(r.created_at)} · {r.nickname ?? "—"} · 품목{" "}
                    {r.line_count}종
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-[11px] ${
                      RECEIPT_STATUS[r.status]?.cls ??
                      "border-zinc-200 text-zinc-600"
                    }`}
                  >
                    {RECEIPT_STATUS[r.status]?.label ?? r.status}
                  </span>
                  <p className="mt-1 text-sm tabular-nums text-zinc-700">
                    입고 {r.received_total}
                    <span className="text-zinc-400"> / 예정 {r.planned_total}</span>
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={hrefWith({ page: String(page - 1) })} className={linkBtn}>
              ← 이전
            </Link>
          )}
          <span className="text-sm text-zinc-500">
            {Math.min(page, totalPages)} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={hrefWith({ page: String(page + 1) })} className={linkBtn}>
              다음 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
