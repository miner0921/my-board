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
  quantity: number | null;
  item_name: string | null;
  item_barcode: string | null;
  user_name: string | null;
};

// scan_logs.error_reason → 한국어 라벨 (scan/manual/exclude API가 기록하는 값 전부)
const SCAN_REASON_LABEL: Record<string, string> = {
  unknown: "미등록 바코드",
  wrong_item: "송장에 없는 품목",
  wrong_item_added: "현장 추가",
  over_quantity_forced: "수량 초과 스캔",
  no_invoice: "송장 미선택 스캔",
  manual_pick: "수동 챙김", // 구버전 로그 호환
  manual_add: "수동 추가",
  manual_remove: "수동 취소",
  item_excluded: "취소",
  item_restored: "복구",
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

  // 이벤트 분류 (3색):
  //   정상(초록) = error_reason 없음
  //   변경(주황) = 의도적으로 바꾼 것 (error_reason 있고 is_error=false)
  //   오류(빨강) = 잘못 찍은 것 (is_error=true: 미등록/송장없음/송장에없는품목)
  const changeCount = logs.filter((l) => l.error_reason && !l.is_error).length;
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
        <div className="flex items-center gap-1.5">
          {changeCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">
              변경 {changeCount}건
            </span>
          )}
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 border border-red-200">
              <AlertTriangle size={12} strokeWidth={2} />
              오류 {errorCount}건
            </span>
          )}
        </div>
      </div>

      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        {logs.map((log) => {
          // 색 규칙(3색): 정상(초록) / 변경(주황) / 오류(빨강)
          const isNormal = !log.error_reason;
          const isError = log.is_error;
          const label = isNormal
            ? "정상"
            : SCAN_REASON_LABEL[log.error_reason!] ?? log.error_reason!;
          const badgeClass = isNormal
            ? "bg-green-50 text-green-700 border-green-200"
            : isError
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-amber-50 text-amber-700 border-amber-200";
          // 변화량 ×N — quantity가 있고 0보다 클 때만 품목명 옆에 표시
          const showQty = log.quantity != null && log.quantity > 0;
          return (
            <div
              key={log.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 last:border-b-0 text-sm"
            >
              {/* 시각 */}
              <span className="font-mono text-xs text-zinc-400 w-[60px] shrink-0">
                {formatTime(log.scanned_at)}
              </span>

              {/* 품목 (×N) / 바코드 */}
              <div className="flex-1 min-w-0">
                <p className="text-zinc-800 truncate">
                  {log.item_name ?? (
                    <span className="text-zinc-400">미등록 품목</span>
                  )}
                  {showQty && (
                    <span className="ml-1.5 font-mono text-xs text-zinc-500">
                      ×{log.quantity}
                    </span>
                  )}
                </p>
                {log.item_barcode && (
                  <p className="font-mono text-[11px] text-zinc-400 truncate">
                    {log.item_barcode}
                  </p>
                )}
              </div>

              {/* 상태 배지 — 정상(초록) / 변경(주황) / 오류(빨강) */}
              <div className="shrink-0">
                <span
                  className={`inline-block px-2 py-0.5 text-[11px] rounded border ${badgeClass}`}
                >
                  {label}
                </span>
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
