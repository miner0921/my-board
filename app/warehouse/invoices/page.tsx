import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { Upload } from "lucide-react";
import InvoiceGroup from "./InvoiceGroup";

type InvoiceRow = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  status: string;
  customer_type: string | null;
  created_at: string;
  completed_at: string | null;
  total_qty: number;
  scanned_qty: number;
};

function statusBadge(status: string) {
  if (status === "completed") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
        완료
      </span>
    );
  }
  if (status === "completed_partial") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-800 border border-amber-300">
        부분 완료
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">
      대기
    </span>
  );
}

function formatDateShort(date: string) {
  const d = new Date(date);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

// 발주서 시트별 customer_type 매핑 (마이그레이션 007 참고)
function customerTypeBadge(type: string | null) {
  if (type === "business") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-blue-50 text-blue-700 border border-blue-200">
        사업자
      </span>
    );
  }
  if (type === "individual") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-green-50 text-green-700 border border-green-200">
        개인
      </span>
    );
  }
  if (type === "retail") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-purple-50 text-purple-700 border border-purple-200">
        소매
      </span>
    );
  }
  return (
    <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
      미분류
    </span>
  );
}

const ALLOWED_TYPES = new Set(["business", "individual", "retail", "none"]);
type SortMode = "created" | "completed";

// ── 날짜 그룹화 유틸 ────────────────────────────────────────
// 현재 날짜 기준으로:
//   오늘 / 어제 / 이번 주(요일) / 그 외(M/D) / 30일 이전 (한 그룹)
type GroupKey = string; // "today" | "yesterday" | "WEEK:YYYY-MM-DD" | "DATE:YYYY-MM-DD" | "older"

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function diffDays(later: Date, earlier: Date): number {
  return Math.round(
    (startOfDay(later).getTime() - startOfDay(earlier).getTime()) /
      (24 * 60 * 60 * 1000)
  );
}

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function groupKeyFor(when: string, now: Date): GroupKey {
  const d = new Date(when);
  const days = diffDays(now, d);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `WEEK:${k}`;
  }
  if (days <= 30) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `DATE:${k}`;
  }
  return "older";
}

function labelFor(key: GroupKey, sample: string | null): string {
  if (key === "today") {
    const d = new Date();
    return `오늘 (${d.getMonth() + 1}/${d.getDate()}, ${KO_WEEKDAY[d.getDay()]})`;
  }
  if (key === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `어제 (${d.getMonth() + 1}/${d.getDate()}, ${KO_WEEKDAY[d.getDay()]})`;
  }
  if (key === "older") return "이전";
  if (!sample) return key;
  const d = new Date(sample);
  if (key.startsWith("WEEK:")) {
    return `${d.getMonth() + 1}/${d.getDate()} (${KO_WEEKDAY[d.getDay()]})`;
  }
  // DATE:
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

type PageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    sort?: string;
  }>;
};

export default async function InvoiceListPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const {
    q: qParam,
    status: statusParam,
    type: typeParam,
    sort: sortParam,
  } = await searchParams;
  const q = (qParam ?? "").trim();
  const sort: SortMode = sortParam === "completed" ? "completed" : "created";
  const status =
    statusParam === "pending" ||
    statusParam === "completed" ||
    statusParam === "completed_partial"
      ? statusParam
      : "all";
  const customerType =
    typeParam && ALLOWED_TYPES.has(typeParam) ? typeParam : "all";
  const isFiltered =
    q !== "" ||
    (sort !== "completed" && status !== "all") ||
    customerType !== "all";

  // 동적 WHERE 구성
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(
      `(i.invoice_no ILIKE $${params.length} OR i.order_no ILIKE $${params.length})`
    );
  }
  if (sort === "completed") {
    // 완료일 탭에서는 상태 필터 무시하고 완료/부분완료 모두
    conditions.push(
      `i.status IN ('completed', 'completed_partial') AND i.completed_at IS NOT NULL`
    );
  } else if (status !== "all") {
    params.push(status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (customerType !== "all") {
    if (customerType === "none") {
      conditions.push(`i.customer_type IS NULL`);
    } else {
      params.push(customerType);
      conditions.push(`i.customer_type = $${params.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderCol = sort === "completed" ? "i.completed_at" : "i.created_at";

  const result = await query(
    `SELECT
       i.id, i.invoice_no, i.order_no,
       i.recipient_name, i.recipient_phone,
       i.status, i.customer_type, i.created_at, i.completed_at,
       COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
       COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
     FROM invoices i
     LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
     ${where}
     GROUP BY i.id
     ORDER BY ${orderCol} DESC NULLS LAST`,
    params
  );

  const invoices: InvoiceRow[] = result.rows;

  // 그룹핑
  const now = new Date();
  const groupOrder: GroupKey[] = [];
  const groups = new Map<
    GroupKey,
    { sample: string | null; rows: InvoiceRow[] }
  >();
  for (const inv of invoices) {
    const basis = sort === "completed" ? inv.completed_at : inv.created_at;
    if (!basis) continue; // completed_at 없는 경우는 위 WHERE에서 걸러짐
    const key = groupKeyFor(basis, now);
    if (!groups.has(key)) {
      groups.set(key, { sample: basis, rows: [] });
      groupOrder.push(key);
    }
    groups.get(key)!.rows.push(inv);
  }

  // 쿼리스트링 헬퍼 (탭 전환 시 필터 유지)
  const buildHref = (overrides: Partial<{ sort: SortMode }>) => {
    const sp = new URLSearchParams();
    const nextSort = overrides.sort ?? sort;
    if (nextSort !== "created") sp.set("sort", nextSort);
    if (q) sp.set("q", q);
    if (nextSort !== "completed" && status !== "all") sp.set("status", status);
    if (customerType !== "all") sp.set("type", customerType);
    const qs = sp.toString();
    return qs ? `/warehouse/invoices?${qs}` : "/warehouse/invoices";
  };

  return (
    <div className="max-w-6xl">
      {/* 액션 바 */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-zinc-500">
          발주서와 송장 파일을 업로드하면 자동으로 등록됩니다
        </p>
        <Link
          href="/warehouse/upload"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium self-start sm:self-auto"
        >
          <Upload size={16} strokeWidth={1.75} />
          송장 업로드
        </Link>
      </div>

      {/* 정렬 탭 */}
      <div className="mb-4 flex gap-2 border-b border-zinc-200">
        <Link
          href={buildHref({ sort: "created" })}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
            sort === "created"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          등록일 기준
        </Link>
        <Link
          href={buildHref({ sort: "completed" })}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
            sort === "completed"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          완료일 기준
        </Link>
      </div>

      {/* 검색 + 필터 */}
      <form
        action="/warehouse/invoices"
        method="get"
        className="mb-6 flex flex-wrap gap-2"
      >
        {/* sort 유지 (탭 클릭 외에는 현재 탭 보존) */}
        {sort !== "created" && <input type="hidden" name="sort" value={sort} />}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="송장번호 또는 주문번호로 검색"
          className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <select
          name="status"
          defaultValue={status}
          disabled={sort === "completed"}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
          title={
            sort === "completed"
              ? "완료일 탭에서는 완료된 송장만 표시됩니다"
              : ""
          }
        >
          <option value="all">상태: 전체</option>
          <option value="pending">대기</option>
          <option value="completed">완료</option>
          <option value="completed_partial">부분 완료</option>
        </select>
        <select
          name="type"
          defaultValue={customerType}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="all">분류: 전체</option>
          <option value="business">사업자</option>
          <option value="individual">개인</option>
          <option value="retail">소매</option>
          <option value="none">미분류</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
        >
          검색
        </button>
        {isFiltered && (
          <Link
            href={sort === "completed" ? "/warehouse/invoices?sort=completed" : "/warehouse/invoices"}
            className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 빈 상태 */}
      {invoices.length === 0 ? (
        isFiltered ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">검색 결과가 없습니다.</p>
            <p className="text-xs text-zinc-400">
              조건을 바꾸거나 초기화 버튼을 눌러보세요.
            </p>
          </div>
        ) : sort === "completed" ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">완료된 송장이 없습니다.</p>
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-600 mb-1 text-base">
              아직 등록된 송장이 없습니다.
            </p>
            <p className="text-xs text-zinc-400 mb-6">
              발주서와 송장 파일을 업로드해 시작하세요.
            </p>
            <Link
              href="/warehouse/upload"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
            >
              <Upload size={16} strokeWidth={1.75} />
              송장 업로드
            </Link>
          </div>
        )
      ) : (
        <div>
          {groupOrder.map((key) => {
            const g = groups.get(key)!;
            const completedCount = g.rows.filter(
              (r) => r.status === "completed"
            ).length;
            const partialCount = g.rows.filter(
              (r) => r.status === "completed_partial"
            ).length;
            const defaultOpen = key === "today" || key === "yesterday";
            return (
              <InvoiceGroup
                key={key}
                label={labelFor(key, g.sample)}
                totalCount={g.rows.length}
                completedCount={completedCount}
                partialCount={partialCount}
                defaultOpen={defaultOpen}
              >
                <InvoiceTable rows={g.rows} sort={sort} />
              </InvoiceGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InvoiceTable({
  rows,
  sort,
}: {
  rows: InvoiceRow[];
  sort: SortMode;
}) {
  return (
    <div>
      {/* 헤더 */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-600">
        <div className="col-span-3">송장번호</div>
        <div className="col-span-2">주문번호</div>
        <div className="col-span-2">수령인</div>
        <div className="col-span-1 text-center">분류</div>
        <div className="col-span-1 text-center">진행</div>
        <div className="col-span-1 text-center">상태</div>
        <div className="col-span-2 text-center">
          {sort === "completed" ? "완료" : "등록"}
        </div>
      </div>

      {/* 행 */}
      {rows.map((inv) => {
        const dateText =
          sort === "completed"
            ? inv.completed_at
              ? formatDateShort(inv.completed_at)
              : "-"
            : formatDateShort(inv.created_at);
        return (
          <Link
            key={inv.id}
            href={`/warehouse/invoices/${inv.id}`}
            className="block sm:grid sm:grid-cols-12 gap-3 px-4 py-3 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition text-sm"
          >
            <div className="sm:col-span-3 font-mono text-zinc-900 truncate">
              {inv.invoice_no}
            </div>
            <div className="sm:col-span-2 font-mono text-xs text-zinc-600 truncate">
              {inv.order_no ?? <span className="text-zinc-300">-</span>}
            </div>
            <div className="sm:col-span-2 text-zinc-700 truncate">
              <span className="sm:hidden text-zinc-400 text-xs mr-1">
                수령인:
              </span>
              {inv.recipient_name ?? <span className="text-zinc-300">-</span>}
              {inv.recipient_phone && (
                <span className="text-xs text-zinc-400 ml-1">
                  {inv.recipient_phone}
                </span>
              )}
            </div>
            <div className="sm:col-span-1 sm:text-center">
              <span className="sm:hidden text-zinc-400 text-xs mr-1">분류:</span>
              {customerTypeBadge(inv.customer_type)}
            </div>
            <div className="sm:col-span-1 sm:text-center text-zinc-600 text-xs">
              <span className="sm:hidden text-zinc-400 mr-1">진행:</span>
              {inv.scanned_qty} / {inv.total_qty}
            </div>
            <div className="sm:col-span-1 sm:text-center">
              {statusBadge(inv.status)}
            </div>
            <div className="sm:col-span-2 sm:text-center text-zinc-500 text-xs">
              {dateText}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
