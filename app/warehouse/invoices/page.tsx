import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Upload, Search } from "lucide-react";
import UploadButton from "./UploadButton";
import ViewToggleButton from "./ViewToggleButton";
import PaginatedInvoiceList from "./PaginatedInvoiceList";
import InvoiceFilterControls from "./InvoiceFilterControls";
import StatusFilterSelect from "./StatusFilterSelect";
import {
  BulkSelectProvider,
  BulkActionButton,
} from "../_components/BulkSelect";
import {
  fetchInvoiceList,
  INVOICE_PAGE_SIZE,
  type InvoiceListFilters,
  type InvoiceTab,
} from "@/lib/invoice-list";

const ALLOWED_TYPES = new Set(["business", "individual", "retail", "none"]);

// 상태 탭: 대기(처리할 일) / 완료(관리용). 역할축.
//   - pending: 미완료 송장(부분 스캔 진행중 포함). 작업 대기열.
//   - done: 완료/부분완료. ★ keyset "더 보기" 페이지네이션 적용(무한 누적 대비).
type Tab = InvoiceTab;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    tab?: string;
    from?: string;
    to?: string;
    deleted?: string;
    status?: string;
  }>;
};

export default async function InvoiceListPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const {
    q: qParam,
    type: typeParam,
    tab: tabParam,
    from: fromParam,
    to: toParam,
    deleted: delParam,
    status: statusParam,
  } = await searchParams;
  // 삭제(soft delete)·복구·삭제내역 조회는 로그인한 작업자 전원 허용.
  const viewDeleted = delParam === "1";
  const q = (qParam ?? "").trim();
  const tab: Tab = tabParam === "done" ? "done" : "pending";
  const customerType =
    typeParam && ALLOWED_TYPES.has(typeParam) ? typeParam : "all";
  // YYYY-MM-DD 형식만 통과 (잘못된 값은 무시)
  const isDate = (v: string | undefined): v is string =>
    !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isDate(fromParam) ? fromParam : "";
  const to = isDate(toParam) ? toParam : "";
  // 상태 필터 — 탭별 화이트리스트(아니면 "all"). 완료=완료/부분완료, 대기=대기/검수중.
  const STATUS_OPTIONS =
    tab === "done"
      ? ["all", "completed", "completed_partial"]
      : ["all", "waiting", "inspecting"];
  const statusFilter =
    statusParam && STATUS_OPTIONS.includes(statusParam) ? statusParam : "all";
  const isFiltered =
    q !== "" ||
    customerType !== "all" ||
    from !== "" ||
    to !== "" ||
    statusFilter !== "all";

  const filters: InvoiceListFilters = {
    tab,
    viewDeleted,
    q,
    customerType,
    from,
    to,
    statusFilter,
  };

  // 세 탭(완료/대기/삭제) 모두 keyset 페이지네이션 — 무한 누적 대비.
  //   1페이지(INVOICE_PAGE_SIZE)만 SSR하고, 나머지는 클라이언트 "더 보기"로.
  const { rows: invoices, nextCursor, hasMore } = await fetchInvoiceList(
    filters,
    { limit: INVOICE_PAGE_SIZE }
  );

  // 추가 로드 API로 넘길 현재 필터(q/type/from/to)만 담은 쿼리스트링.
  const apiSp = new URLSearchParams();
  if (q) apiSp.set("q", q);
  if (customerType !== "all") apiSp.set("type", customerType);
  if (from) apiSp.set("from", from);
  if (to) apiSp.set("to", to);
  if (statusFilter !== "all") apiSp.set("status", statusFilter);
  const filterQuery = apiSp.toString();

  // 쿼리스트링 헬퍼 (탭 전환 시 필터 유지)
  const buildHref = (overrides: Partial<{ tab: Tab }>) => {
    const sp = new URLSearchParams();
    const nextTab = overrides.tab ?? tab;
    // 탭 전환 시 검색/필터는 초기화 — 각 탭은 필터 없는 상태로 시작(q·type·from·to 제외).
    if (nextTab !== "pending") sp.set("tab", nextTab);
    const qs = sp.toString();
    return qs ? `/warehouse/invoices?${qs}` : "/warehouse/invoices";
  };

  // 초기화 링크 — 현재 보기(탭/숨김)는 유지하되 검색/필터만 비움
  const resetHref = viewDeleted
    ? "/warehouse/invoices?deleted=1"
    : tab === "done"
      ? "/warehouse/invoices?tab=done"
      : "/warehouse/invoices";

  return (
    <BulkSelectProvider>
    <div className="max-w-6xl">
      {/* 버튼 줄 — 삭제 보기=되돌아가기(왼쪽), 활성=발주서 업로드(오른쪽) */}
      <div className="mb-4 flex">
        {viewDeleted ? (
          <ViewToggleButton
            href="/warehouse/invoices"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← 되돌아가기
          </ViewToggleButton>
        ) : (
          <UploadButton className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium">
            <Upload size={16} strokeWidth={1.75} />
            발주서 및 송장 업로드
          </UploadButton>
        )}
      </div>

      {/* 상태 탭 (숨김 보기에서는 숨김) */}
      {!viewDeleted && (
        <div className="mb-4 flex gap-2 border-b border-zinc-200">
          <Link
            href={buildHref({ tab: "pending" })}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === "pending"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            대기
          </Link>
          <Link
            href={buildHref({ tab: "done" })}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === "done"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            완료
          </Link>
        </div>
      )}

      {/* 검색 + 필터 (두 줄: 윗줄=검색어, 아랫줄=분류·날짜·초기화) */}
      <form action="/warehouse/invoices" method="get" className="mb-6 space-y-2">
        {/* tab/숨김 보기 유지 (필터 검색 시 현재 보기 보존) */}
        {tab !== "pending" && !viewDeleted && (
          <input type="hidden" name="tab" value={tab} />
        )}
        {viewDeleted && <input type="hidden" name="deleted" value="1" />}

        {/* 윗줄: 검색어 + 검색 버튼 (엔터로도 제출 — form 기본 submit) */}
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="송장번호·주문번호·수령인·연락처로 검색"
            className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53]"
          >
            <Search size={16} strokeWidth={2} />
            검색
          </button>
        </div>

        {/* 아랫줄: 상태 → 분류 → 날짜(즉시 반영) → 초기화(맨 오른쪽) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 탭별 상태 필터 — 완료=완료/부분완료(status), 대기=대기/검수중(진행률) */}
          {!viewDeleted && tab === "done" && (
            <StatusFilterSelect
              value={statusFilter}
              options={[
                { value: "all", label: "상태: 전체" },
                { value: "completed", label: "완료" },
                { value: "completed_partial", label: "부분완료" },
              ]}
            />
          )}
          {!viewDeleted && tab === "pending" && (
            <StatusFilterSelect
              value={statusFilter}
              options={[
                { value: "all", label: "상태: 전체" },
                { value: "waiting", label: "대기" },
                { value: "inspecting", label: "검수중" },
              ]}
            />
          )}
          <InvoiceFilterControls
            customerType={customerType}
            from={from}
            to={to}
          />
          {/* 오른쪽 끝: 초기화 + 선택 삭제/복구 + 삭제 항목 보기 */}
          <div className="ml-auto flex items-center gap-2">
            {isFiltered && (
              <Link
                href={resetHref}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
              >
                초기화
              </Link>
            )}
            <BulkActionButton
              resource="invoices"
              viewDeleted={viewDeleted}
              noun="송장"
              hideVerb="삭제"
            />
            {!viewDeleted && (
              <ViewToggleButton
                href="/warehouse/invoices?deleted=1"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                삭제 항목 보기
              </ViewToggleButton>
            )}
          </div>
        </div>
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
        ) : tab === "done" ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">완료된 송장이 없습니다.</p>
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-600 mb-1 text-base">
              처리할 송장이 없습니다.
            </p>
            <p className="text-xs text-zinc-400 mb-6">
              새 송장을 업로드하거나, 완료된 송장은 검수 이력에서 확인하세요.
            </p>
            <UploadButton className="inline-flex items-center gap-1.5 px-6 py-3 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition">
              <Upload size={16} strokeWidth={1.75} />
              발주서 및 송장 업로드
            </UploadButton>
          </div>
        )
      ) : (
        // 세 탭(완료/대기/삭제) 공용: 1페이지 SSR + 클라이언트 "더 보기" 페이지네이션
        // key: 화면 데이터를 결정하는 값(탭/보기/검색/필터)을 모두 포함 → 전환 시
        //   client useState(initialRows)가 강제 리마운트되어 새 SSR 데이터로 초기화됨.
        <PaginatedInvoiceList
          key={`${tab}-${viewDeleted}-${q}-${customerType}-${from}-${to}-${statusFilter}`}
          initialRows={invoices}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          filterQuery={filterQuery}
          tab={tab}
          viewDeleted={viewDeleted}
        />
      )}
    </div>
    </BulkSelectProvider>
  );
}
