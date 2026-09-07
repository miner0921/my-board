import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import NewAdjustmentButton from "./NewAdjustmentButton";
import AdjustmentList, { type AdjustRow } from "./AdjustmentList";

// 재고 조정 — 입출고와 별개. 장부와 실물이 어긋났을 때의 정정 기록이다.
//   관리자      : 등록 즉시 반영
//   일반 작업자 : 승인 요청만 올라가고, 관리자가 승인해야 재고가 움직인다(049)

const PAGE_SIZE = 50;

const TABS: Record<string, { label: string; statuses: string[] }> = {
  pending: { label: "승인 대기", statuses: ["pending"] },
  decided: { label: "처리됨", statuses: ["approved", "rejected"] },
};

type PageProps = {
  searchParams: Promise<{ tab?: string; page?: string }>;
};

export default async function AdjustmentsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const sp = await searchParams;
  const tab = TABS[sp.tab ?? ""] ? (sp.tab as string) : "pending";
  const page = Math.max(1, Number(sp.page) || 1);

  const params: unknown[] = [TABS[tab].statuses];
  const whereSql = `WHERE a.status = ANY($1::text[])`;

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM item_stock_adjustments a ${whereSql}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.min(page, totalPages) - 1) * PAGE_SIZE;

  const res = await query(
    `SELECT a.id, a.item_id, a.before_quantity, a.after_quantity,
            a.reason, a.status,
            a.expiry_date::text   AS expiry_date,
            a.received_date::text AS received_date,
            a.requested_at, a.decided_at, a.decide_memo,
            i.name       AS item_name,
            ru.nickname  AS requester,
            du.nickname  AS decider
       FROM item_stock_adjustments a
       JOIN items i       ON i.id = a.item_id
       LEFT JOIN users ru ON ru.id = a.requested_by
       LEFT JOIN users du ON du.id = a.decided_by
       ${whereSql}
      ORDER BY a.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  );
  const rows = res.rows.map((r) => ({
    ...r,
    requested_at: String(r.requested_at),
    decided_at: r.decided_at ? String(r.decided_at) : null,
  })) as AdjustRow[];

  const hrefWith = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams({ tab });
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    return `/warehouse/stock/adjustments?${s.toString()}`;
  };

  const linkBtn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition";

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/warehouse/stock" className={linkBtn}>
          ← 재고 현황
        </Link>
        <div className="ml-auto">
          <NewAdjustmentButton isAdmin={isAdmin} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(TABS).map(([key, { label }]) => (
          <Link
            key={key}
            href={hrefWith({ tab: key, page: null })}
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
          {tab === "pending"
            ? "승인 대기 중인 조정 요청이 없습니다."
            : "처리된 조정이 없습니다."}
        </div>
      ) : (
        <AdjustmentList rows={rows} isAdmin={isAdmin} />
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
