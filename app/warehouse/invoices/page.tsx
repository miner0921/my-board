import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Upload } from "lucide-react";
import UploadButton from "./UploadButton";
import CompletedList from "./CompletedList";
import { InvoiceTable } from "./_list";
import {
  fetchInvoiceList,
  INVOICE_PAGE_SIZE,
  type InvoiceListFilters,
  type InvoiceTab,
} from "@/lib/invoice-list";
import {
  BulkSelectProvider,
  BulkBar,
} from "../_components/BulkSelect";

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
  const isFiltered =
    q !== "" || customerType !== "all" || from !== "" || to !== "";

  const filters: InvoiceListFilters = { tab, viewDeleted, q, customerType, from, to };

  // 완료 탭(활성)만 페이지네이션 — 무한 누적 대비. 대기/삭제 보기는 현행대로 전체.
  const paginate = tab === "done" && !viewDeleted;
  const { rows: invoices, nextCursor, hasMore } = paginate
    ? await fetchInvoiceList(filters, { limit: INVOICE_PAGE_SIZE })
    : await fetchInvoiceList(filters);

  // 추가 로드 API로 넘길 현재 필터(q/type/from/to)만 담은 쿼리스트링.
  const apiSp = new URLSearchParams();
  if (q) apiSp.set("q", q);
  if (customerType !== "all") apiSp.set("type", customerType);
  if (from) apiSp.set("from", from);
  if (to) apiSp.set("to", to);
  const filterQuery = apiSp.toString();

  // 쿼리스트링 헬퍼 (탭 전환 시 필터 유지)
  const buildHref = (overrides: Partial<{ tab: Tab }>) => {
    const sp = new URLSearchParams();
    const nextTab = overrides.tab ?? tab;
    if (nextTab !== "pending") sp.set("tab", nextTab);
    if (q) sp.set("q", q);
    if (customerType !== "all") sp.set("type", customerType);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
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
    <div className="max-w-6xl">
      {/* 액션 바 */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {viewDeleted
            ? "삭제한 송장 — 선택해서 복구할 수 있습니다 (검수기록 보존됨)"
            : "발주서와 송장 파일을 업로드하면 자동으로 등록됩니다"}
        </p>
        {viewDeleted ? (
          <Link
            href="/warehouse/invoices"
            className="px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition self-start sm:self-auto"
          >
            ← 활성 송장
          </Link>
        ) : (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href="/warehouse/invoices?deleted=1"
              className="px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
            >
              삭제 항목 보기
            </Link>
            <UploadButton className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium">
              <Upload size={16} strokeWidth={1.75} />
              발주서 및 송장 업로드
            </UploadButton>
          </div>
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

      {/* 검색 + 필터 */}
      <form
        action="/warehouse/invoices"
        method="get"
        className="mb-6 flex flex-wrap gap-2"
      >
        {/* tab/숨김 보기 유지 (필터 검색 시 현재 보기 보존) */}
        {tab !== "pending" && !viewDeleted && (
          <input type="hidden" name="tab" value={tab} />
        )}
        {viewDeleted && <input type="hidden" name="deleted" value="1" />}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="송장번호·주문번호·수령인·연락처로 검색"
          className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
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
        <input
          type="date"
          name="from"
          defaultValue={from}
          aria-label="시작일"
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <span className="self-center text-zinc-400 text-sm">~</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          aria-label="종료일"
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
            href={resetHref}
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
      ) : paginate ? (
        // 완료 탭(활성): 클라이언트 "더 보기" 페이지네이션
        <CompletedList
          initialRows={invoices}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          filterQuery={filterQuery}
        />
      ) : (
        // 대기 탭 / 삭제 보기: 평면 목록 전체 서버 렌더(페이지네이션 없음)
        <BulkSelectProvider>
          <BulkBar
            allIds={invoices.map((i) => i.id)}
            resource="invoices"
            viewDeleted={viewDeleted}
            noun="송장"
            hideVerb="삭제"
          />
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <InvoiceTable
              rows={invoices}
              tab={tab}
              selectable={true}
              viewDeleted={viewDeleted}
            />
          </div>
        </BulkSelectProvider>
      )}
    </div>
  );
}
