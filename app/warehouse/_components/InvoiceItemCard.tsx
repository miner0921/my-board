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
  // 제외됨(검수 중 빼기) — 진행률엔 안 잡히지만 기록 보존용으로 회색 표시
  excluded?: boolean;
  excludeReason?: string | null;
  excludedByName?: string | null;
};

export default function InvoiceItemCard({
  item,
  variant,
  highlighted = false,
  isPartial = false,
  action,
}: {
  item: InvoiceItemCardData;
  variant: "detail" | "scan";
  highlighted?: boolean;
  isPartial?: boolean;
  action?: React.ReactNode; // 우측 액션 슬롯(예: 복구 버튼)
}) {
  const { quantity, scannedCount } = item;
  const excluded = !!item.excluded;
  // scan_exempt = 동봉(배지)일 뿐, 검수에서 빠지지 않음 → 카운트/완료 정상 표시.
  const exempt = !!item.scanExempt;
  const complete = scannedCount >= quantity && quantity > 0;
  const over = scannedCount > quantity && quantity > 0;
  const overCount = scannedCount - quantity;
  const lack = Math.max(0, quantity - scannedCount);
  const isShort = isPartial && lack > 0; // detail 전용
  const showOriginal = !!item.displayName && item.displayName !== item.name;

  // 상태 테두리 — 기존 토큰 유지(검수는 약간 더 진하고 over에 ring).
  // 제외됨은 모든 상태보다 우선해 회색 점선 처리.
  const borderClass = excluded
    ? "border-dashed border-zinc-300"
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
      } ${excluded ? "bg-zinc-50 opacity-70" : ""}`}
    >
      <div className={excluded ? "grayscale" : ""}>
        <ItemThumb
          itemId={item.itemId}
          hasImage={item.hasImage}
          updatedAt={item.updatedAt}
          name={item.name}
          size="sm"
        />
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className={`font-medium text-sm truncate ${
            excluded ? "text-zinc-500 line-through" : "text-zinc-900"
          }`}
        >
          {item.name}
        </h3>
        {showOriginal && (
          <p className="text-[10px] text-zinc-400 truncate">
            ★{item.displayName}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-xs text-zinc-700">×{quantity}</span>
          {excluded ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-300">
              취소됨
              {item.excludedByName ? ` · ${item.excludedByName}` : ""}
            </span>
          ) : (
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
          )}
          {!excluded && exempt && (
            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-200">
              동봉
            </span>
          )}
          {!excluded && over && (
            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-700 border-red-200">
              초과 +{overCount}
            </span>
          )}
          {item.isAddedOnScan && (
            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200">
              현장 추가
            </span>
          )}
          {!excluded && isShort && (
            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-700 border-red-200">
              결품 {lack}
            </span>
          )}
        </div>
        {excluded && item.excludeReason && (
          <p className="mt-0.5 text-[10px] text-zinc-400 truncate">
            사유: {item.excludeReason}
          </p>
        )}
      </div>

      {/* 우측: 바코드(제외 안 된 경우) + 액션 슬롯(제외/복구 버튼) */}
      <div className="shrink-0 max-w-[42%] flex flex-col items-end gap-1.5">
        {!excluded && (
          <BarcodeTag barcode={item.barcode} className="inline-block max-w-full" />
        )}
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
