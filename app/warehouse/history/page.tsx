import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import InvoiceGroup from "../invoices/InvoiceGroup";

// 완료된 검수(송장) 이력 목록.
// status가 completed / completed_partial 인 송장만, 완료일(completed_at) 최신순.
// 필터: 날짜 범위(from~to), 작업자(completed_by), 송장번호 검색.
// 송장 목록 페이지와 동일하게 날짜별 그룹화(InvoiceGroup).

type HistoryRow = {
  id: number;
  invoice_no: string;
  status: string;
  completed_at: string;
  completion_reason: string | null;
  completed_by_name: string | null;
};

type WorkerOption = {
  id: number;
  nickname: string;
};

const COMPLETION_REASON_LABEL: Record<string, string> = {
  full: "정상 완료",
  out_of_stock: "재고 부족",
  customer_cancel: "고객 취소",
  damaged: "파손",
  other: "기타",
};

function statusBadge(status: string) {
  if (status === "completed") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
        완료
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-800 border border-amber-300">
      부분 완료
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

// ── 날짜 그룹화 유틸 (송장 목록 페이지와 동일 규칙) ───────────────
type GroupKey = string;

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
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `DATE:${k}`;
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
  if (!sample) return key;
  const d = new Date(sample);
  if (key.startsWith("WEEK:")) {
    return `${d.getMonth() + 1}/${d.getDate()} (${KO_WEEKDAY[d.getDay()]})`;
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

type PageProps = {
  searchParams: Promise<{
    q?: string;
    worker?: string;
    from?: string;
    to?: string;
  }>;
};

// YYYY-MM-DD 형식만 통과시킨다 (잘못된 입력은 무시).
function safeDate(v: string | undefined): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export default async function HistoryListPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const {
    q: qParam,
    worker: workerParam,
    from: fromParam,
    to: toParam,
  } = await searchParams;
  const q = (qParam ?? "").trim();
  const workerId = workerParam && /^\d+$/.test(workerParam) ? workerParam : "";
  const from = safeDate(fromParam);
  const to = safeDate(toParam);
  const isFiltered = q !== "" || workerId !== "" || from !== null || to !== null;

  // 동적 WHERE — 완료된 송장만 기본 조건
  const conditions: string[] = [
    `i.status IN ('completed', 'completed_partial')`,
    `i.completed_at IS NOT NULL`,
  ];
  const params: unknown[] = [];
  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(`i.invoice_no ILIKE $${params.length}`);
  }
  if (workerId !== "") {
    params.push(Number(workerId));
    conditions.push(`i.completed_by = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`i.completed_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    // to 당일 23:59까지 포함하도록 +1일 미만
    conditions.push(`i.completed_at < ($${params.length}::date + interval '1 day')`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const [result, workersResult] = await Promise.all([
    query(
      `SELECT i.id, i.invoice_no, i.status, i.completed_at, i.completion_reason,
              uo.nickname AS completed_by_name
         FROM invoices i
         LEFT JOIN users uo ON i.completed_by = uo.id
         ${where}
        ORDER BY i.completed_at DESC`,
      params
    ),
    // 작업자 필터 드롭다운 — 완료 이력이 있는 사용자만
    query(
      `SELECT DISTINCT u.id, u.nickname
         FROM invoices i
         JOIN users u ON i.completed_by = u.id
        WHERE i.status IN ('completed', 'completed_partial')
          AND i.completed_by IS NOT NULL
        ORDER BY u.nickname`
    ),
  ]);

  const rows: HistoryRow[] = result.rows;
  const workers: WorkerOption[] = workersResult.rows;

  // 그룹핑 (completed_at 기준)
  const now = new Date();
  const groupOrder: GroupKey[] = [];
  const groups = new Map<GroupKey, { sample: string; rows: HistoryRow[] }>();
  for (const r of rows) {
    const key = groupKeyFor(r.completed_at, now);
    if (!groups.has(key)) {
      groups.set(key, { sample: r.completed_at, rows: [] });
      groupOrder.push(key);
    }
    groups.get(key)!.rows.push(r);
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <p className="text-sm text-zinc-500">
          완료된 검수 송장의 이력입니다. 송장을 누르면 검수 상세와 스캔 기록을
          볼 수 있습니다.
        </p>
      </div>

      {/* 검색 + 필터 */}
      <form
        action="/warehouse/history"
        method="get"
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="송장번호로 검색"
          className="flex-1 min-w-[180px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <select
          name="worker"
          defaultValue={workerId}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">작업자: 전체</option>
          {workers.map((w) => (
            <option key={w.id} value={String(w.id)}>
              {w.nickname}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <span className="text-zinc-400 text-sm">~</span>
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
        >
          검색
        </button>
        {isFiltered && (
          <Link
            href="/warehouse/history"
            className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 빈 상태 */}
      {rows.length === 0 ? (
        isFiltered ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">검색 결과가 없습니다.</p>
            <p className="text-xs text-zinc-400">
              조건을 바꾸거나 초기화 버튼을 눌러보세요.
            </p>
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">완료된 검수 이력이 없습니다.</p>
            <p className="text-xs text-zinc-400">
              송장 검수를 완료하면 여기에 기록됩니다.
            </p>
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
                <HistoryTable rows={g.rows} />
              </InvoiceGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <div>
      {/* 헤더 */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-600">
        <div className="col-span-4">송장번호</div>
        <div className="col-span-2 text-center">상태</div>
        <div className="col-span-2">완료자</div>
        <div className="col-span-2">사유</div>
        <div className="col-span-2 text-center">완료일시</div>
      </div>

      {/* 행 */}
      {rows.map((r) => {
        const reasonText =
          r.completion_reason && r.completion_reason !== "full"
            ? COMPLETION_REASON_LABEL[r.completion_reason] ?? r.completion_reason
            : null;
        return (
          <Link
            key={r.id}
            href={`/warehouse/history/${r.id}`}
            className="block sm:grid sm:grid-cols-12 gap-3 px-4 py-3 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition text-sm"
          >
            <div className="sm:col-span-4 font-mono text-zinc-900 truncate">
              {r.invoice_no}
            </div>
            <div className="sm:col-span-2 sm:text-center">
              <span className="sm:hidden text-zinc-400 text-xs mr-1">상태:</span>
              {statusBadge(r.status)}
            </div>
            <div className="sm:col-span-2 text-zinc-700 truncate">
              <span className="sm:hidden text-zinc-400 text-xs mr-1">
                완료자:
              </span>
              {r.completed_by_name ?? <span className="text-zinc-300">-</span>}
            </div>
            <div className="sm:col-span-2 text-zinc-600 text-xs truncate">
              {reasonText ? (
                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {reasonText}
                </span>
              ) : (
                <span className="text-zinc-300">-</span>
              )}
            </div>
            <div className="sm:col-span-2 sm:text-center text-zinc-500 text-xs">
              {formatDateShort(r.completed_at)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
