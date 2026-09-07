import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, History, ClipboardList, AlertTriangle } from "lucide-react";
import NewAdjustmentButton from "./adjustments/NewAdjustmentButton";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import StockMoveButton from "./StockMoveButton";
import StockSplit, { type StockRow, type Lot } from "./StockSplit";

// 재고 현황 — 품목별 총재고 + 로트(소비기한·입고일별) 상세.
//   로트가 차감되는 순서대로 그대로 보여준다(위에 있는 로트가 먼저 나간다).

// 페이지 넘기기 없이 목록 박스 스크롤로만 본다. 한 번에 가져올 최대 줄 수(안전장치).
// 넘치면 검색으로 좁히라고 안내한다.
const MAX_ROWS = 1000;

// 소비기한 임박 기준(일). 이 안쪽이면 목록에서 강조된다.
const SOON_DAYS = 30;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    zero?: string; // 1 = 재고 0인 품목도 표시
    soon?: string; // 1 = 소비기한 임박만
  }>;
};

export default async function StockPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const showZero = sp.zero === "1";
  const soonOnly = sp.soon === "1";

  const params: unknown[] = [];
  const where: string[] = ["i.deleted_at IS NULL"];

  if (q !== "") {
    params.push(`%${q}%`);
    where.push(`(i.name ILIKE $${params.length} OR i.barcode ILIKE $${params.length})`);
  }

  // 재고 합계는 로트를 GROUP BY 로 접어서 구한다.
  const having: string[] = [];
  // 기본은 "재고가 0이 아닌" 품목 — 마이너스 재고도 보여야 눈에 띈다.
  if (!showZero) having.push("COALESCE(SUM(l.quantity), 0) <> 0");
  if (soonOnly) {
    params.push(SOON_DAYS);
    having.push(
      `MIN(l.expiry_date) FILTER (WHERE l.quantity > 0) <= CURRENT_DATE + ($${params.length}::int)`
    );
  }

  const baseSql = `
    FROM items i
    LEFT JOIN item_lots l ON l.item_id = i.id
    WHERE ${where.join(" AND ")}
    GROUP BY i.id
    ${having.length > 0 ? `HAVING ${having.join(" AND ")}` : ""}
  `;

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM (SELECT i.id ${baseSql}) s`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;

  const rowsRes = await query(
    `SELECT i.id, i.name, i.barcode, i.expiry_managed,
            COALESCE(SUM(l.quantity), 0)::int AS total_qty,
            MIN(l.expiry_date) FILTER (WHERE l.quantity > 0)::text AS nearest_expiry
     ${baseSql}
     ORDER BY i.name ASC, i.id ASC
     LIMIT ${MAX_ROWS}`,
    params
  );
  const rows = rowsRes.rows as StockRow[];

  // 화면에 뜬 품목의 로트만 추가 조회 — 차감 순서 그대로 정렬.
  const itemIds = rows.map((r) => r.id);
  const lotsRes =
    itemIds.length === 0
      ? { rows: [] }
      : await query(
          `SELECT id, item_id, quantity,
                  expiry_date::text   AS expiry_date,
                  received_date::text AS received_date,
                  (expiry_date - CURRENT_DATE)::int AS days_left
             FROM item_lots
            WHERE item_id = ANY($1::int[]) AND quantity <> 0
            ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC`,
          [itemIds]
        );
  const lotsByItem: Record<number, Lot[]> = {};
  for (const l of lotsRes.rows as Lot[]) {
    (lotsByItem[l.item_id] ??= []).push(l);
  }

  // 조정 승인 대기 건수(버튼 배지). 049 적용 전이면 0으로 둔다.
  const pendingAdjust: number = await query(
    `SELECT COUNT(*)::int AS n FROM item_stock_adjustments WHERE status = 'pending'`
  )
    .then((r) => r.rows[0]?.n ?? 0)
    .catch(() => 0);

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (showZero) baseParams.set("zero", "1");
  if (soonOnly) baseParams.set("soon", "1");
  const toggleHref = (key: "zero" | "soon") => {
    const s = new URLSearchParams(baseParams);
    if (s.get(key) === "1") s.delete(key);
    else s.set(key, "1");
    const str = s.toString();
    return `/warehouse/stock${str ? `?${str}` : ""}`;
  };

  const linkBtn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition";

  return (
    <div className="max-w-6xl md:h-full md:flex md:flex-col md:min-h-0">
      {/* 상단 버튼 줄 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 shrink-0">
        <Link href="/warehouse/stock/history" className={linkBtn}>
          <History size={16} strokeWidth={1.75} />
          입출고 내역
        </Link>
        <Link href="/warehouse/stock/adjustments" className={linkBtn}>
          조정 내역
          {pendingAdjust > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] tabular-nums">
              {pendingAdjust}
            </span>
          )}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/warehouse/stock/receipts" className={linkBtn}>
            <ClipboardList size={16} strokeWidth={1.75} />
            입고증
          </Link>
          {isAdmin && (
            <>
              <StockMoveButton mode="in" />
              <StockMoveButton mode="out" />
            </>
          )}
          <NewAdjustmentButton isAdmin={isAdmin} />
        </div>
      </div>

      {/* 승인 대기 알림 — 재고 숫자가 아직 안 맞을 수 있다는 신호 */}
      {pendingAdjust > 0 && (
        <div className="mb-3 shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0" />
          <span>
            승인 대기 중인 재고 조정이 {pendingAdjust}건 있습니다. 승인 전까지는
            재고에 반영되지 않습니다.
          </span>
          <Link
            href="/warehouse/stock/adjustments"
            className="ml-auto underline font-medium"
          >
            {isAdmin ? "승인하러 가기 →" : "확인하기 →"}
          </Link>
        </div>
      )}

      {/* 검색 + 필터 */}
      {/* 검색 + 필터 (한 줄) */}
      <form
        action="/warehouse/stock"
        method="get"
        className="mb-3 flex flex-wrap items-center gap-2 shrink-0"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="품목명·바코드 검색"
          className="w-[26rem] sm:w-[32rem] px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        {showZero && <input type="hidden" name="zero" value="1" />}
        {soonOnly && <input type="hidden" name="soon" value="1" />}
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53]"
        >
          <Search size={16} strokeWidth={2} />
          검색
        </button>
        <Link
          href={toggleHref("soon")}
          className={`px-3 py-2 rounded-lg text-sm border transition ${
            soonOnly
              ? "bg-amber-50 border-amber-300 text-amber-900"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          소비기한 {SOON_DAYS}일 이내
        </Link>
        <Link
          href={toggleHref("zero")}
          className={`px-3 py-2 rounded-lg text-sm border transition ${
            showZero
              ? "bg-zinc-100 border-zinc-400 text-zinc-900"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          재고 0 포함
        </Link>
        <span className="ml-auto text-sm text-zinc-500">
          총 {total}개 품목
          {total > MAX_ROWS && (
            <span className="ml-1 text-amber-700">
              ({MAX_ROWS}개만 표시 — 검색으로 좁히세요)
            </span>
          )}
        </span>
      </form>

      {/* 목록 */}
      <div className="md:flex-1 md:min-h-0">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-xl">
            조건에 맞는 재고가 없습니다.
          </div>
        ) : (
          <StockSplit rows={rows} lotsByItem={lotsByItem} soonDays={SOON_DAYS} />
        )}
      </div>

    </div>
  );
}
