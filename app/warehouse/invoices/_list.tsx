import Link from "next/link";
import type { InvoiceListRow, InvoiceTab } from "@/lib/invoice-list";
import { BulkCheckbox, BulkSelectAllCheckbox } from "../_components/BulkSelect";

// ─────────────────────────────────────────────────────────────
// 송장 목록 공용 렌더 조각. "use client" 없음(shared) — 서버 컴포넌트
// (page.tsx)와 클라이언트 컴포넌트(PaginatedInvoiceList: 세 탭 공용 "더 보기")
// 양쪽에서 그대로 import해 쓴다. 순수 함수 + JSX만(서버 전용 의존 없음).
//
// 평면 목록(날짜 그룹 헤더 없음). 원래 행 컬럼은 100% 보존하고, 맨 앞에
// 일시 컬럼만 새로 추가했다(기존 trailing 날짜 컬럼이 맨 앞으로 이동).
//   행 컬럼: [일시] 송장번호(+매칭) · 주문번호 · 수령인(+연락처) · 분류 · 진행 · 상태
//   · 완료 탭=완료일시(completed_at) · 대기 탭=등록일시(created_at)
//   · 삭제 보기=삭제일시(deleted_at) + 삭제자
//   정렬이 날짜 DESC라 자연히 날짜 내림차순으로 나열된다.
// ─────────────────────────────────────────────────────────────

export type InvoiceRow = InvoiceListRow;

// 상태 배지 — status + 진행률(scannedQty)로 분기.
//   · pending & scanned=0  → 대기      · pending & scanned>0 → 검수중
//   · completed            → 완료      · completed_partial   → 부분완료
//   ※ "검수중"은 진행률 판정(표시 전용) — status 저장값은 그대로 pending.
export function statusBadge(status: string, scannedQty = 0) {
  if (status === "completed") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
        완료
      </span>
    );
  }
  if (status === "completed_partial") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded border border-zinc-200 bg-[#F1EFE8] text-[#5F5E5A]">
        부분 완료
      </span>
    );
  }
  if (status === "manual_completed") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700 border border-purple-200">
        수동완료
      </span>
    );
  }
  // pending: 진행 중(스캔된 것 있음)이면 "검수중", 아니면 "대기".
  if (scannedQty > 0) {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded border border-[#BBD6F0] bg-[#E6F1FB] text-[#0C447C]">
        검수중
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">
      대기
    </span>
  );
}

// 매칭 태그 배지 (송장번호 옆) — matched는 차분, invoice_only는 노란 강조.
export function matchBadge(tag: string | null) {
  if (tag === "invoice_only") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[11px] rounded bg-amber-50 text-amber-700 border border-amber-200">
        송장만
      </span>
    );
  }
  if (tag === "matched") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[11px] rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
        매칭
      </span>
    );
  }
  return null;
}

// 발주서 시트별 customer_type 매핑 (마이그레이션 007 참고)
export function customerTypeBadge(type: string | null) {
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

// 항상 한국시간(Asia/Seoul)으로 YYYY-MM-DD HH:mm 표시 (환경 TZ 무관, 연도 포함).
export function formatDateTime(date: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function InvoiceTable({
  rows,
  tab,
  selectable,
  viewDeleted,
}: {
  rows: InvoiceRow[];
  tab: InvoiceTab;
  selectable: boolean;
  viewDeleted: boolean;
}) {
  const dateLabel = viewDeleted
    ? "삭제일시"
    : tab === "done"
      ? "완료일시"
      : "등록일시";

  return (
    <div>
      {/* 헤더 (데스크탑) */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-600">
        {selectable && (
          <span className="w-4 shrink-0 flex items-center justify-center">
            <BulkSelectAllCheckbox allIds={rows.map((r) => r.id)} />
          </span>
        )}
        <div className="flex-1 grid grid-cols-12 gap-3">
          <div className="col-span-3">{dateLabel}</div>
          <div className="col-span-2">송장번호</div>
          <div className="col-span-2">주문번호</div>
          <div className="col-span-2">수령인</div>
          <div className="col-span-1 text-center">분류</div>
          <div className="col-span-1 text-center">진행</div>
          <div className="col-span-1 text-center">상태</div>
        </div>
      </div>

      {/* 행 */}
      {rows.map((inv) => {
        const dateVal = viewDeleted
          ? inv.deleted_at
          : tab === "done"
            ? inv.completed_at
            : inv.created_at;
        const dateText = dateVal ? formatDateTime(dateVal) : "-";
        return (
          <div
            key={inv.id}
            className="flex items-center gap-3 px-4 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition"
          >
            {selectable && (
              <div className="shrink-0">
                <BulkCheckbox id={inv.id} />
              </div>
            )}
            <Link
              href={`/warehouse/invoices/${inv.id}`}
              prefetch={false}
              className="flex-1 min-w-0 block sm:grid sm:grid-cols-12 gap-3 py-3 text-sm"
            >
              {/* 일시 (맨 앞 — 새로 추가) */}
              <div className="sm:col-span-3 font-mono text-xs sm:text-sm text-zinc-600">
                <span className="sm:hidden text-zinc-400 mr-1">{dateLabel}:</span>
                {dateText}
                {viewDeleted && (
                  <span className="block text-[11px] text-zinc-400">
                    {inv.deleted_by_name ?? "(알 수 없음)"}
                  </span>
                )}
              </div>
              {/* 송장번호 + 매칭 배지 */}
              <div className="sm:col-span-2 font-mono text-zinc-900 truncate flex items-center gap-1.5">
                <span className="truncate">{inv.invoice_no}</span>
                {matchBadge(inv.match_tag)}
              </div>
              {/* 주문번호 */}
              <div className="sm:col-span-2 font-mono text-xs text-zinc-600 truncate">
                {inv.order_no ?? <span className="text-zinc-300">-</span>}
              </div>
              {/* 수령인 + 연락처 */}
              <div className="sm:col-span-2 text-zinc-700 truncate">
                <span className="sm:hidden text-zinc-400 text-xs mr-1">수령인:</span>
                {inv.recipient_name ?? <span className="text-zinc-300">-</span>}
                {inv.recipient_phone && (
                  <span className="text-xs text-zinc-400 ml-1">
                    {inv.recipient_phone}
                  </span>
                )}
              </div>
              {/* 분류 */}
              <div className="sm:col-span-1 sm:text-center">
                <span className="sm:hidden text-zinc-400 text-xs mr-1">분류:</span>
                {customerTypeBadge(inv.customer_type)}
              </div>
              {/* 진행률 */}
              <div className="sm:col-span-1 sm:text-center text-zinc-600 text-xs">
                <span className="sm:hidden text-zinc-400 mr-1">진행:</span>
                {inv.scanned_qty} / {inv.total_qty}
              </div>
              {/* 상태 (부분완료 포함) */}
              <div className="sm:col-span-1 sm:text-center">
                <span className="sm:hidden text-zinc-400 text-xs mr-1">상태:</span>
                {statusBadge(inv.status, inv.scanned_qty)}
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
