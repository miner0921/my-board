import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { RefreshCw, ScanLine } from "lucide-react";
import ReopenButton from "./ReopenButton";
import DeleteInvoiceButton from "./DeleteInvoiceButton";
import ScanLogTimeline, { type ScanLog } from "./ScanLogTimeline";
import InvoiceItemCard from "../../_components/InvoiceItemCard";

type Invoice = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  recipient_postal_code: string | null;
  delivery_note: string | null;
  sender_name: string | null;
  raw_product_name: string | null;
  customer_type: string | null;
  created_at: string;
  scan_started_at: string | null;
  completed_at: string | null;
  completion_reason: string | null;
  completion_note: string | null;
  created_by_name: string | null;
  scan_started_by_name: string | null;
  completed_by_name: string | null;
  total_qty: number;
  scanned_qty: number;
};

const COMPLETION_REASON_LABEL: Record<string, string> = {
  full: "정상 완료",
  out_of_stock: "재고 부족",
  customer_cancel: "고객 취소",
  damaged: "파손",
  other: "기타",
};

// 두 시각 사이의 소요시간을 한국어로 포맷.
// < 60s: "12초"  /  < 60m: "3분 21초"  /  < 24h: "1시간 8분"  /  >= 24h: "2일 3시간"
function formatDuration(start: string, end: string): string {
  const sec = Math.max(
    0,
    Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  );
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}분 ${remSec}초` : `${min}분`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return remMin > 0 ? `${hr}시간 ${remMin}분` : `${hr}시간`;
  const day = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr > 0 ? `${day}일 ${remHr}시간` : `${day}일`;
}

type ReopenEntry = {
  id: number;
  reopened_at: string;
  reason: string | null;
  prev_status: string | null;
  prev_completion_reason: string | null;
  reopened_by_name: string | null;
};

type InvoiceItem = {
  invoice_item_id: number;
  item_id: number;
  quantity: number;
  scanned_count: number;
  display_name: string | null; // 송장 원본 (★(증정샘플)망고 등)
  name: string;                // 정규화 후 마스터 품목명
  barcode: string | null;
  has_image: boolean;
  updated_at: string;
  is_added_on_scan: boolean;
  scan_exempt: boolean;
};

// 항상 한국시간(Asia/Seoul)으로 표시. 서버 컴포넌트라 실행 환경 TZ(UTC)에
// 영향받지 않도록 timeZone을 명시한다. DB의 TIMESTAMP는 UTC 순간으로 저장됨.
function formatDate(date: string | null) {
  if (!date) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
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

// 발주서 시트별 customer_type 매핑 (마이그레이션 007 주석 참고)
function customerTypeBadge(type: string | null) {
  if (type === "business") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200">
        사업자
      </span>
    );
  }
  if (type === "individual") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
        개인
      </span>
    );
  }
  if (type === "retail") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700 border border-purple-200">
        소매
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
      미분류
    </span>
  );
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");
  const isAdmin =
    ((session.user as { role?: string }).role ?? "user") === "admin";

  const { id } = await params;

  const [invResult, itemsResult, reopensResult, logsResult] = await Promise.all([
    query(
      `SELECT
         i.id, i.invoice_no, i.order_no, i.status,
         i.recipient_name, i.recipient_phone, i.recipient_address,
         i.recipient_postal_code, i.delivery_note, i.sender_name,
         i.raw_product_name, i.customer_type,
         i.created_at, i.scan_started_at, i.completed_at,
         i.completion_reason, i.completion_note,
         uc.nickname AS created_by_name,
         us.nickname AS scan_started_by_name,
         uo.nickname AS completed_by_name,
         COALESCE(SUM(ii.quantity) FILTER (WHERE it.scan_exempt IS NOT TRUE), 0)::int      AS total_qty,
         COALESCE(SUM(ii.scanned_count) FILTER (WHERE it.scan_exempt IS NOT TRUE), 0)::int AS scanned_qty
       FROM invoices i
       LEFT JOIN users uc          ON i.created_by      = uc.id
       LEFT JOIN users us          ON i.scan_started_by = us.id
       LEFT JOIN users uo          ON i.completed_by    = uo.id
       LEFT JOIN invoice_items ii  ON ii.invoice_id     = i.id
       LEFT JOIN items it          ON it.id             = ii.item_id
       WHERE i.id = $1
       GROUP BY i.id, uc.nickname, us.nickname, uo.nickname`,
      [id]
    ),
    // 품목 카드용 — image_data(BYTEA)는 SELECT 안 하고 has_image만
    query(
      `SELECT
         ii.id AS invoice_item_id,
         ii.item_id, ii.quantity, ii.scanned_count, ii.display_name,
         ii.is_added_on_scan,
         it.name, it.barcode, it.updated_at, it.scan_exempt,
         (it.image_data IS NOT NULL) AS has_image
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id`,
      [id]
    ),
    // 재개 이력 (최신순)
    query(
      `SELECT r.id, r.reopened_at, r.reason,
              r.prev_status, r.prev_completion_reason,
              u.nickname AS reopened_by_name
         FROM invoice_reopens r
         LEFT JOIN users u ON r.reopened_by = u.id
        WHERE r.invoice_id = $1
        ORDER BY r.reopened_at DESC`,
      [id]
    ),
    // 스캔 기록 — 누가/언제/무슨 품목(바코드)을 찍었는지, 오류 포함. 시간순.
    query(
      `SELECT s.id, s.scanned_at, s.is_error, s.error_reason, s.item_id,
              it.name AS item_name, it.barcode AS item_barcode,
              u.nickname AS user_name
         FROM scan_logs s
         LEFT JOIN items it ON s.item_id = it.id
         LEFT JOIN users u  ON s.user_id = u.id
        WHERE s.invoice_id = $1
        ORDER BY s.scanned_at ASC, s.id ASC`,
      [id]
    ),
  ]);

  if (invResult.rows.length === 0) notFound();
  const invoice: Invoice = invResult.rows[0];
  const items: InvoiceItem[] = itemsResult.rows;
  const reopens: ReopenEntry[] = reopensResult.rows;
  const logs: ScanLog[] = logsResult.rows;

  const progressPct =
    invoice.total_qty > 0
      ? Math.round((invoice.scanned_qty / invoice.total_qty) * 100)
      : 0;

  return (
    <div className="max-w-4xl">
      {/* 기본 정보 */}
      <article className="border border-zinc-200 rounded-lg p-6 bg-white">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 mb-1">송장번호</p>
            <h1 className="text-xl font-bold font-mono text-zinc-900 break-all">
              {invoice.invoice_no}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {customerTypeBadge(invoice.customer_type)}
            {invoice.status === "completed" ? (
              <span className="px-3 py-1 text-sm rounded bg-green-50 text-green-700 border border-green-200">
                완료
              </span>
            ) : invoice.status === "completed_partial" ? (
              <span className="px-3 py-1 text-sm rounded bg-amber-50 text-amber-800 border border-amber-300">
                부분 완료
              </span>
            ) : (
              <span className="px-3 py-1 text-sm rounded bg-amber-50 text-amber-700 border border-amber-200">
                대기
              </span>
            )}
          </div>
        </div>

        {/* 메타 */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm pb-4 border-b border-zinc-100">
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">주문번호</dt>
            <dd className="font-mono text-zinc-800">
              {invoice.order_no ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">송하인</dt>
            <dd className="text-zinc-800">
              {invoice.sender_name ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>

          {/* 진행률 (전폭) */}
          <div className="sm:col-span-2">
            <dt className="text-xs text-zinc-500 mb-1">진행률</dt>
            <dd>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      progressPct === 100
                        ? "bg-green-500"
                        : progressPct > 0
                          ? "bg-zinc-700"
                          : "bg-zinc-300"
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-600 whitespace-nowrap">
                  <span className="font-semibold text-zinc-900">
                    {invoice.scanned_qty}
                  </span>
                  <span className="text-zinc-400"> / </span>
                  <span>{invoice.total_qty}</span>
                  <span className="text-zinc-400 ml-1">({progressPct}%)</span>
                </span>
              </div>
            </dd>
          </div>

          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">등록</dt>
            <dd className="text-zinc-600 text-xs">
              {formatDate(invoice.created_at)}
              {invoice.created_by_name && (
                <span className="ml-1 text-zinc-400">
                  · {invoice.created_by_name}
                </span>
              )}
            </dd>
          </div>
          {invoice.scan_started_at && (
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">검수 시작</dt>
              <dd className="text-zinc-600 text-xs">
                {formatDate(invoice.scan_started_at)}
                {invoice.scan_started_by_name && (
                  <span className="ml-1 text-zinc-400">
                    · {invoice.scan_started_by_name}
                  </span>
                )}
              </dd>
            </div>
          )}
          {invoice.completed_at && (
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">검수 완료</dt>
              <dd className="text-zinc-600 text-xs">
                {formatDate(invoice.completed_at)}
                {invoice.completed_by_name && (
                  <span className="ml-1 text-zinc-400">
                    · {invoice.completed_by_name}
                  </span>
                )}
              </dd>
            </div>
          )}
          {invoice.scan_started_at && invoice.completed_at && (
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">소요 시간</dt>
              <dd className="text-zinc-800 text-xs font-medium">
                {formatDuration(invoice.scan_started_at, invoice.completed_at)}
              </dd>
            </div>
          )}
        </dl>

        {/* 결품 완료 정보 (completed_partial인 경우만) */}
        {invoice.status === "completed_partial" && invoice.completion_reason && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <p className="text-xs font-semibold text-amber-900 mb-2">
              결품 완료 사유
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-[11px] text-amber-700">사유</dt>
                <dd className="text-amber-900 font-medium">
                  {COMPLETION_REASON_LABEL[invoice.completion_reason] ??
                    invoice.completion_reason}
                </dd>
              </div>
              {invoice.completion_note && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-amber-700">메모</dt>
                  <dd className="text-amber-900 text-xs whitespace-pre-wrap">
                    {invoice.completion_note}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* 재개 이력 (있을 때) */}
        {reopens.length > 0 && (
          <div className="mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
            <p className="text-xs font-semibold text-zinc-700 mb-2 flex items-center gap-1.5">
              <RefreshCw size={13} strokeWidth={2} />
              재개 이력 ({reopens.length}건)
            </p>
            <ul className="space-y-2 text-xs">
              {reopens.map((r) => {
                const prevLabel =
                  r.prev_status === "completed_partial"
                    ? `부분 완료${
                        r.prev_completion_reason
                          ? ` (${COMPLETION_REASON_LABEL[r.prev_completion_reason] ?? r.prev_completion_reason})`
                          : ""
                      }`
                    : r.prev_status === "completed"
                      ? "완료"
                      : r.prev_status ?? "-";
                const isAuto =
                  !!r.reason && r.reason.startsWith("수량 추가로 자동 재개");
                return (
                  <li
                    key={r.id}
                    className={`border-l-2 pl-3 py-0.5 ${
                      isAuto ? "border-blue-300" : "border-zinc-300"
                    }`}
                  >
                    <p className="text-zinc-600">
                      {formatDate(r.reopened_at)}
                      {r.reopened_by_name && (
                        <span className="text-zinc-400">
                          {" "}
                          · {r.reopened_by_name}
                        </span>
                      )}
                      {isAuto && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] border bg-blue-50 text-blue-700 border-blue-200">
                          자동 재개
                        </span>
                      )}
                    </p>
                    {r.reason && (
                      <p className="text-zinc-800 mt-0.5">
                        <span className="text-zinc-500">사유:</span> {r.reason}
                      </p>
                    )}
                    <p className="text-zinc-500 mt-0.5">
                      이전 상태:{" "}
                      <span className="text-zinc-700">{prevLabel}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 수령인 (평문) */}
        <div className="pt-4">
          <p className="text-xs text-zinc-500 mb-2">수령인</p>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">성명</dt>
              <dd className="text-zinc-800">
                {invoice.recipient_name ?? "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">전화</dt>
              <dd className="text-zinc-800 font-mono text-xs">
                {invoice.recipient_phone ?? "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">우편번호</dt>
              <dd className="text-zinc-800 font-mono text-xs">
                {invoice.recipient_postal_code ?? "-"}
              </dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs text-zinc-500 mb-0.5">주소</dt>
              <dd className="text-zinc-800 text-xs">
                {invoice.recipient_address ?? "-"}
              </dd>
            </div>
            {invoice.delivery_note && (
              <div className="sm:col-span-3">
                <dt className="text-xs text-zinc-500 mb-0.5">배송메시지</dt>
                <dd className="text-zinc-600 text-xs whitespace-pre-wrap">
                  {invoice.delivery_note}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </article>

      {/* 품목 목록 */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-900">
            품목{" "}
            <span className="text-zinc-400 font-normal text-sm">
              ({items.length}건)
            </span>
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
            연결된 품목이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <InvoiceItemCard
                key={it.invoice_item_id}
                item={{
                  itemId: it.item_id,
                  name: it.name,
                  displayName: it.display_name,
                  barcode: it.barcode,
                  quantity: it.quantity,
                  scannedCount: it.scanned_count,
                  hasImage: it.has_image,
                  updatedAt: it.updated_at,
                  isAddedOnScan: it.is_added_on_scan,
                  scanExempt: it.scan_exempt,
                }}
                variant="detail"
                isPartial={invoice.status === "completed_partial"}
              />
            ))}
          </div>
        )}
      </section>

      {/* 스캔 기록 타임라인 — 스캔 내역이 있으면 항상 표시(진행중 포함) */}
      <ScanLogTimeline logs={logs} />

      {/* 검수 시작 진입 (pending) 또는 검수 재개 (completed/partial) */}
      {invoice.status === "pending" && (
        <div className="mt-6">
          <Link
            href="/warehouse/scan"
            className="flex items-center justify-center gap-1.5 w-full py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
          >
            <ScanLine size={16} strokeWidth={1.75} />
            출고 검수로 이동
          </Link>
          <p className="text-[11px] text-zinc-400 text-center mt-2">
            검수 페이지에서 이 송장 바코드({invoice.invoice_no})를 스캔하세요
          </p>
        </div>
      )}
      {isAdmin &&
        (invoice.status === "completed" ||
          invoice.status === "completed_partial") && (
          <div className="mt-6">
            <ReopenButton
              invoiceId={invoice.id}
              invoiceNo={invoice.invoice_no}
              scannedQty={invoice.scanned_qty}
              totalQty={invoice.total_qty}
            />
          </div>
        )}

      {isAdmin && (
        <div className="mt-4">
          <DeleteInvoiceButton
            invoiceId={invoice.id}
            invoiceNo={invoice.invoice_no}
          />
        </div>
      )}

      {/* 원본 상품명 (디버깅/감사용) */}
      {invoice.raw_product_name && (
        <details className="mt-4 text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-700">
            원본 상품명 문자열 (raw)
          </summary>
          <pre className="mt-2 p-3 bg-zinc-50 border border-zinc-200 rounded text-zinc-700 whitespace-pre-wrap break-all">
            {invoice.raw_product_name}
          </pre>
        </details>
      )}
    </div>
  );
}
