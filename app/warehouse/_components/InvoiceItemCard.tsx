import ItemThumb from "./ItemThumb";
import BarcodeTag from "./BarcodeTag";

// 송장 라인 품목 — 컴팩트 가로 행 카드.
//   [작은 썸네일] 품목명 / ×수량 · 스캔 N/M 배지 · 상태배지 / 바코드
// 송장 상세(variant="detail")와 검수 화면(variant="scan")이 같은 컴포넌트를 공유한다.
//   - detail: 결품(부분완료) 배지까지 표시
//   - scan : 마지막 스캔 항목 강조(highlighted) + 진행 상태 강조
// 색상/디자인 토큰은 기존 카드 그대로 유지하고 레이아웃만 컴팩트화.
// (presentational — 서버/클라이언트 양쪽에서 사용 가능)

export type InvoiceItemCardData = {
  itemId: number;
  name: string;
  displayName: string | null;
  barcode: string | null;
  quantity: number;
  scannedCount: number;
  hasImage: boolean;
  updatedAt: string;
  isAddedOnScan: boolean;
  scanExempt?: boolean;
};

export default function InvoiceItemCard({
  item,
  variant,
  highlighted = false,
  isPartial = false,
}: {
  item: InvoiceItemCardData;
  variant: "detail" | "scan";
  highlighted?: boolean;
  isPartial?: boolean;
}) {
  const { quantity, scannedCount } = item;
  const exempt = !!item.scanExempt;
  const complete = !exempt && scannedCount >= quantity && quantity > 0;
  const over = !exempt && scannedCount > quantity && quantity > 0;
  const overCount = scannedCount - quantity;
  const lack = Math.max(0, quantity - scannedCount);
  const isShort = !exempt && isPartial && lack > 0; // detail 전용
  const showOriginal = !!item.displayName && item.displayName !== item.name;

  // 상태 테두리 — 기존 토큰 유지(검수는 약간 더 진하고 over에 ring).
  const borderClass = exempt
    ? "border-zinc-200 border-dashed"
    : over
    ? variant === "scan"
      ? "border-red-400 ring-2 ring-red-200"
      : "border-red-300"
    : isShort
      ? "border-red-300"
      : item.isAddedOnScan
        ? variant === "scan"
          ? "border-amber-400"
          : "border-amber-300"
        : complete && variant === "scan"
          ? "border-green-300"
          : "border-zinc-200";

  return (
    <div
      className={`flex items-center gap-3 p-2 border rounded-lg bg-white transition-all ${borderClass} ${
        highlighted ? "shadow-md scale-[1.02]" : ""
      }`}
    >
      <ItemThumb
        itemId={item.itemId}
        hasImage={item.hasImage}
        updatedAt={item.updatedAt}
        name={item.name}
        size="sm"
      />

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm text-zinc-900 truncate">
          {item.name}
        </h3>
        {showOriginal && (
          <p className="text-[10px] text-zinc-400 truncate">
            ★{item.displayName}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {exempt ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-200">
              스캔 불필요
            </span>
          ) : (
            <>
              <span className="font-medium text-xs text-zinc-700">
                ×{quantity}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                  over
                    ? "bg-red-50 text-red-700 border-red-200"
                    : complete
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200"
                }`}
              >
                스캔 {scannedCount}/{quantity}
              </span>
              {over && (
                <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-700 border-red-200">
                  초과 +{overCount}
                </span>
              )}
              {item.isAddedOnScan && (
                <span className="px-1.5 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200">
                  현장 추가
                </span>
              )}
              {isShort && (
                <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-700 border-red-200">
                  결품 {lack}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 바코드 — 행 우측, 좁은 화면에서는 잘림 처리 */}
      <div className="shrink-0 max-w-[38%] text-right">
        <BarcodeTag barcode={item.barcode} className="inline-block max-w-full" />
      </div>
    </div>
  );
}
