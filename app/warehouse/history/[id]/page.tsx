import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { ArrowLeft, ScanLine, AlertTriangle } from "lucide-react";

// 완료된 송장의 검수 상세 + 스캔 기록(scan_logs).
// 송장 상세 페이지(/warehouse/invoices/[id])와 같은 스타일의 읽기 전용 화면.

type Invoice = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  status: string;
  recipient_name: string | null;
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

type InvoiceItem = {
  invoice_item_id: number;
  item_id: number;
  quantity: number;
  scanned_count: number;
  display_name: string | null;
  name: string;
  barcode: string | null;
  has_image: boolean;
  updated_at: string;
  is_added_on_scan: boolean;
};

type ScanLog = {
  id: number;
  scanned_at: string;
  is_error: boolean;
  error_reason: string | null;
  item_id: number | null;
  item_name: string | null;
  item_barcode: string | null;
  user_name: string | null;
};

const COMPLETION_REASON_LABEL: Record<string, string> = {
  full: "정상 완료",
  out_of_stock: "재고 부족",
  customer_cancel: "고객 취소",
  damaged: "파손",
  other: "기타",
};

// scan_logs.error_reason → 한국어 라벨 (scan API가 기록하는 값들)
const SCAN_REASON_LABEL: Record<string, string> = {
  unknown: "미등록 바코드",
  wrong_item: "송장에 없는 품목",
  wrong_item_added: "현장 추가",
  over_quantity_forced: "수량 초과 스캔",
  no_invoice: "송장 미선택 스캔",
};

function formatDate(date: string | null) {
  if (!date) return "-";
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatTime(date: string) {
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mi}:${ss}`;
}

// 두 시각 사이의 소요시간을 한국어로 포맷 (송장 상세와 동일 규칙).
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

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HistoryDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const [invResult, itemsResult, logsResult] = await Promise.all([
    query(
      `SELECT
         i.id, i.invoice_no, i.order_no, i.status,
         i.recipient_name, i.customer_type,
         i.created_at, i.scan_started_at, i.completed_at,
         i.completion_reason, i.completion_note,
         uc.nickname AS created_by_name,
         us.nickname AS scan_started_by_name,
         uo.nickname AS completed_by_name,
         COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
         COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
       FROM invoices i
       LEFT JOIN users uc          ON i.created_by      = uc.id
       LEFT JOIN users us          ON i.scan_started_by = us.id
       LEFT JOIN users uo          ON i.completed_by    = uo.id
       LEFT JOIN invoice_items ii  ON ii.invoice_id     = i.id
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
         it.name, it.barcode, it.updated_at,
         (it.image_data IS NOT NULL) AS has_image
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id`,
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
  const logs: ScanLog[] = logsResult.rows;

  const progressPct =
    invoice.total_qty > 0
      ? Math.round((invoice.scanned_qty / invoice.total_qty) * 100)
      : 0;

  const errorCount = logs.filter((l) => l.is_error).length;

  return (
    <div className="max-w-4xl">
      {/* 뒤로 */}
      <Link
        href="/warehouse/history"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition mb-4"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        검수 이력
      </Link>

      {/* 기본 정보 */}
      <article className="border border-zinc-200 rounded-lg p-6 bg-white">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 mb-1">송장번호</p>
            <h1 className="text-xl font-bold font-mono text-zinc-900 break-all">
              {invoice.invoice_no}
            </h1>
          </div>
          <div className="shrink-0">
            {invoice.status === "completed" ? (
              <span className="px-3 py-1 text-sm rounded bg-green-50 text-green-700 border border-green-200">
                완료
              </span>
            ) : (
              <span className="px-3 py-1 text-sm rounded bg-amber-50 text-amber-800 border border-amber-300">
                부분 완료
              </span>
            )}
          </div>
        </div>

        {/* 진행률 */}
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-1">스캔 수량</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  progressPct === 100 ? "bg-green-500" : "bg-zinc-700"
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
        </div>

        {/* 메타 */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm pt-4 border-t border-zinc-100">
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">주문번호</dt>
            <dd className="font-mono text-zinc-800">
              {invoice.order_no ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">수령인</dt>
            <dd className="text-zinc-800">
              {invoice.recipient_name ?? <span className="text-zinc-300">-</span>}
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
          {invoice.scan_started_at && invoice.completed_at && (
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">소요 시간</dt>
              <dd className="text-zinc-800 text-xs font-medium">
                {formatDuration(invoice.scan_started_at, invoice.completed_at)}
              </dd>
            </div>
          )}
        </dl>

        {/* 결품 완료 정보 */}
        {invoice.status === "completed_partial" && invoice.completion_reason && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
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
      </article>

      {/* 품목 목록 */}
      <section className="mt-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-3">
          품목{" "}
          <span className="text-zinc-400 font-normal text-sm">
            ({items.length}건)
          </span>
        </h2>

        {items.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
            연결된 품목이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((it) => {
              const showOriginal =
                !!it.display_name && it.display_name !== it.name;
              const itemScanComplete =
                it.scanned_count >= it.quantity && it.quantity > 0;
              const lack = Math.max(0, it.quantity - it.scanned_count);
              const isShort =
                invoice.status === "completed_partial" && lack > 0;
              const over = it.scanned_count > it.quantity && it.quantity > 0;
              const overCount = it.scanned_count - it.quantity;
              return (
                <div
                  key={it.invoice_item_id}
                  className={`border rounded-lg overflow-hidden bg-white flex flex-col ${
                    over || isShort
                      ? "border-red-300"
                      : it.is_added_on_scan
                        ? "border-amber-300"
                        : "border-zinc-200"
                  }`}
                >
                  <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
                    {it.has_image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/warehouse/items/${it.item_id}/image?v=${new Date(it.updated_at).getTime()}`}
                        alt={it.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-zinc-300">이미지 없음</span>
                    )}
                  </div>

                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-medium text-sm text-zinc-900 line-clamp-2 mb-1">
                      {it.name}
                    </h3>
                    {showOriginal && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2">
                        ★{it.display_name}
                        <span className="mx-1">→</span>
                        {it.name}
                      </p>
                    )}

                    <div className="text-xs text-zinc-700 mb-2 flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">×{it.quantity}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          over
                            ? "bg-red-50 text-red-700 border-red-200"
                            : itemScanComplete
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-zinc-50 text-zinc-600 border-zinc-200"
                        }`}
                      >
                        스캔 {it.scanned_count}/{it.quantity}
                      </span>
                      {over && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-700 border-red-200">
                          초과 +{overCount}
                        </span>
                      )}
                      {it.is_added_on_scan && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200">
                          현장 추가
                        </span>
                      )}
                      {isShort && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-700 border-red-200">
                          결품 {lack}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto">
                      {it.barcode ? (
                        <p className="font-mono text-[11px] text-zinc-600 truncate">
                          {it.barcode}
                        </p>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px]">
                          바코드 미등록
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 스캔 기록 (scan_logs) */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-1.5">
            <ScanLine size={17} strokeWidth={1.75} />
            스캔 기록{" "}
            <span className="text-zinc-400 font-normal text-sm">
              ({logs.length}건)
            </span>
          </h2>
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 border border-red-200">
              <AlertTriangle size={12} strokeWidth={2} />
              오류 {errorCount}건
            </span>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
            스캔 기록이 없습니다.
          </div>
        ) : (
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            {logs.map((log) => {
              const reasonLabel = log.error_reason
                ? SCAN_REASON_LABEL[log.error_reason] ?? log.error_reason
                : null;
              return (
                <div
                  key={log.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 last:border-b-0 text-sm ${
                    log.is_error ? "bg-red-50/40" : ""
                  }`}
                >
                  {/* 시각 */}
                  <span className="font-mono text-xs text-zinc-400 w-[60px] shrink-0">
                    {formatTime(log.scanned_at)}
                  </span>

                  {/* 품목 / 바코드 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-800 truncate">
                      {log.item_name ?? (
                        <span className="text-zinc-400">미등록 품목</span>
                      )}
                    </p>
                    {log.item_barcode && (
                      <p className="font-mono text-[11px] text-zinc-400 truncate">
                        {log.item_barcode}
                      </p>
                    )}
                  </div>

                  {/* 사유 / 상태 배지 */}
                  <div className="shrink-0">
                    {log.is_error ? (
                      <span className="inline-block px-2 py-0.5 text-[11px] rounded bg-red-50 text-red-700 border border-red-200">
                        {reasonLabel ?? "오류"}
                      </span>
                    ) : reasonLabel ? (
                      <span className="inline-block px-2 py-0.5 text-[11px] rounded bg-amber-50 text-amber-700 border border-amber-200">
                        {reasonLabel}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-[11px] rounded bg-green-50 text-green-700 border border-green-200">
                        정상
                      </span>
                    )}
                  </div>

                  {/* 작업자 */}
                  <span className="text-xs text-zinc-500 w-[72px] text-right truncate shrink-0">
                    {log.user_name ?? "-"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
