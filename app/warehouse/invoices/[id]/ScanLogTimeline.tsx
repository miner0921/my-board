import { ScanLine, AlertTriangle } from "lucide-react";

// 송장의 스캔 기록(scan_logs) 타임라인 — 누가/언제/무슨 품목(바코드)을
// 찍었는지, 오류 스캔 포함. 스캔 내역이 있으면 항상 표시(진행중 송장 포함).
// scan_logs는 바코드 원문을 저장하지 않으므로 item_id→items JOIN으로 바코드 표시.
// 검수 이력 상세를 송장 상세로 통합하면서 이 한 컴포넌트로만 렌더한다.

export type ScanLog = {
  id: number;
  scanned_at: string;
  is_error: boolean;
  error_reason: string | null;
  item_id: number | null;
  item_name: string | null;
  item_barcode: string | null;
  user_name: string | null;
};

// scan_logs.error_reason → 한국어 라벨 (scan API가 기록하는 값들)
const SCAN_REASON_LABEL: Record<string, string> = {
  unknown: "미등록 바코드",
  wrong_item: "송장에 없는 품목",
  wrong_item_added: "현장 추가",
  over_quantity_forced: "수량 초과 스캔",
  no_invoice: "송장 미선택 스캔",
};

// 클라이언트 컴포넌트지만 브라우저 TZ에 의존하지 않고 항상 한국시간으로 통일.
function formatTime(date: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

export default function ScanLogTimeline({ logs }: { logs: ScanLog[] }) {
  // 스캔 내역이 없으면 섹션 자체를 렌더하지 않는다.
  if (logs.length === 0) return null;

  const errorCount = logs.filter((l) => l.is_error).length;

  return (
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
    </section>
  );
}
