import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { formatDateTime } from "../../invoices/_list";

// 입출고 내역 — item_stock_movements 원장을 그대로 시간 역순으로 보여준다.
//   모든 행이 로트에 반영된다(재고보다 많이 뺀 경우 그 로트가 음수로 내려간다 — 047).
//   검수 재개로 되돌려진 출고는 "원복됨"으로 표시하고 취소선을 긋는다.

const PAGE_SIZE = 50;

const REASON_LABEL: Record<string, string> = {
  inbound: "입고",
  manual_out: "수동 출고",
  invoice_out: "검수 출고",
  invoice_return: "재개 원복",
  adjust_in: "조정 증가",
  adjust_out: "조정 감소",
};

const REASON_CLASS: Record<string, string> = {
  inbound: "bg-green-50 text-green-800 border-green-200",
  manual_out: "bg-zinc-100 text-zinc-700 border-zinc-200",
  invoice_out: "bg-blue-50 text-blue-800 border-blue-200",
  invoice_return: "bg-violet-50 text-violet-800 border-violet-200",
  adjust_in: "bg-teal-50 text-teal-800 border-teal-200",
  adjust_out: "bg-orange-50 text-orange-800 border-orange-200",
};

type Row = {
  id: number;
  delta: number;
  reason: string;
  created_at: string;
  memo: string | null;
  reversed_at: string | null;
  expiry_date: string | null;
  received_date: string | null;
  item_id: number;
  item_name: string;
  invoice_no: string | null;
  receipt_id: number | null;
  receipt_no: string | null;
  nickname: string | null;
};

type PageProps = {
  searchParams: Promise<{ q?: string; reason?: string; page?: string }>;
};

export default async function StockHistoryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const reason = REASON_LABEL[sp.reason ?? ""] ? (sp.reason as string) : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const params: unknown[] = [];
  const where: string[] = [];
  if (q !== "") {
    params.push(`%${q}%`);
    where.push(`i.name ILIKE $${params.length}`);
  }
  if (reason !== "") {
    params.push(reason);
    where.push(`m.reason = $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await query(
    `SELECT COUNT(*)::int AS total
       FROM item_stock_movements m JOIN items i ON i.id = m.item_id ${whereSql}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.min(page, totalPages) - 1) * PAGE_SIZE;

  const res = await query(
    `SELECT m.id, m.delta, m.reason, m.created_at, m.memo, m.reversed_at,
            m.expiry_date::text   AS expiry_date,
            m.received_date::text AS received_date,
            m.item_id, i.name AS item_name,
            inv.invoice_no,
            m.receipt_id, r.receipt_no,
            u.nickname
       FROM item_stock_movements m
       JOIN items i ON i.id = m.item_id
       LEFT JOIN invoices inv ON inv.id = m.invoice_id
       LEFT JOIN stock_receipts r ON r.id = m.receipt_id
       LEFT JOIN users u ON u.id = m.user_id
       ${whereSql}
      ORDER BY m.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  );
  const rows = res.rows as Row[];

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (reason) baseParams.set("reason", reason);
  const hrefWith = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams(baseParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    const str = s.toString();
    return `/warehouse/stock/history${str ? `?${str}` : ""}`;
  };

  const linkBtn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition";

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <Link href="/warehouse/stock" className={linkBtn}>
          ← 재고 현황
        </Link>
      </div>

      <form
        action="/warehouse/stock/history"
        method="get"
        className="mb-4 flex gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="품목명으로 검색"
          className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        {reason && <input type="hidden" name="reason" value={reason} />}
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53]"
        >
          <Search size={16} strokeWidth={2} />
          검색
        </button>
      </form>

      {/* 구분 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={hrefWith({ reason: null, page: null })}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            reason === ""
              ? "bg-zinc-900 border-zinc-900 text-white"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          전체
        </Link>
        {Object.entries(REASON_LABEL).map(([key, label]) => (
          <Link
            key={key}
            href={hrefWith({ reason: key, page: null })}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              reason === key
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
          입출고 내역이 없습니다.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">일시</th>
                  <th className="text-left font-medium px-3 py-2">품목</th>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">구분</th>
                  <th className="text-right font-medium px-3 py-2 whitespace-nowrap">수량</th>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">소비기한</th>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">입고일</th>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">관련</th>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">작업자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => {
                  const reversed = r.reversed_at !== null;
                  return (
                    <tr key={r.id} className={reversed ? "text-zinc-400" : ""}>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={reversed ? "line-through" : ""}>
                          {r.item_name}
                        </span>
                        {r.memo && (
                          <span className="block text-xs text-zinc-400">{r.memo}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[11px] ${
                            REASON_CLASS[r.reason] ?? "border-zinc-200 text-zinc-600"
                          }`}
                        >
                          {REASON_LABEL[r.reason] ?? r.reason}
                        </span>
                        {reversed && (
                          <span className="ml-1 text-[11px] text-zinc-400">원복됨</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          reversed
                            ? ""
                            : r.delta > 0
                              ? "text-green-700"
                              : "text-red-700"
                        }`}
                      >
                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-zinc-500">
                        {r.expiry_date ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-zinc-500">
                        {r.received_date ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                        {r.invoice_no ? (
                          <span>송장 {r.invoice_no}</span>
                        ) : r.receipt_no ? (
                          <Link
                            href={`/warehouse/stock/receipts/${r.receipt_id}`}
                            className="underline hover:text-zinc-900"
                          >
                            {r.receipt_no}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                        {r.nickname ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
