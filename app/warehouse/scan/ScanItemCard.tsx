import { CheckCircle2, Circle } from "lucide-react";

// 검수 화면 전용 제품 카드 — 이미지 위 + 정보(품목명/수량/스캔수) 아래, 한 줄 5개.
//   - 완료(전부 스캔): 초록 테두리/배경 + ✓
//   - 미스캔(0개): 회색 + 흐리게(opacity) + ○
//   - 진행중(일부): 그대로 + N/M 표시 (전부 찍어야 완료)
// 색상/디자인 토큰은 기존 카드와 동일. 마지막 스캔 항목은 highlighted로 강조.

type ScanItemCardData = {
  itemId: number;
  name: string;
  quantity: number;
  scannedCount: number;
  barcode: string | null;
  hasImage: boolean;
  updatedAt: string;
  isAddedOnScan: boolean;
};

export default function ScanItemCard({
  item,
  highlighted = false,
}: {
  item: ScanItemCardData;
  highlighted?: boolean;
}) {
  const { quantity, scannedCount } = item;
  const complete = scannedCount >= quantity && quantity > 0;
  const over = scannedCount > quantity && quantity > 0;
  const notStarted = scannedCount === 0;

  const borderClass = over
    ? "border-red-400 ring-2 ring-red-200"
    : complete
      ? "border-green-400 bg-green-50"
      : item.isAddedOnScan
        ? "border-amber-400"
        : "border-zinc-200";

  return (
    <div
      className={`relative border rounded-lg overflow-hidden bg-white flex flex-col transition-all ${borderClass} ${
        notStarted && !over ? "opacity-60" : ""
      } ${highlighted ? "shadow-md scale-[1.02]" : ""}`}
    >
      {/* 완료 ✓ / 미완료 ○ */}
      <div className="absolute top-1 right-1 z-10">
        {complete ? (
          <CheckCircle2
            size={18}
            strokeWidth={2}
            className="text-green-600 drop-shadow-sm"
          />
        ) : (
          <Circle size={18} strokeWidth={2} className="text-zinc-300" />
        )}
      </div>

      {/* 이미지 */}
      <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
        {item.hasImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/warehouse/items/${item.itemId}/image?v=${new Date(item.updatedAt).getTime()}`}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[11px] text-zinc-300">이미지 없음</span>
        )}
      </div>

      {/* 정보 */}
      <div className="p-2 flex-1 flex flex-col">
        <h3 className="font-medium text-[11px] sm:text-xs text-zinc-900 line-clamp-2 leading-snug">
          {item.name}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-zinc-500">×{quantity}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
              over
                ? "bg-red-50 text-red-700 border-red-200"
                : complete
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-zinc-50 text-zinc-600 border-zinc-200"
            }`}
          >
            {scannedCount}/{quantity}
          </span>
          {item.isAddedOnScan && (
            <span className="px-1 py-0.5 rounded text-[11px] border bg-amber-50 text-amber-700 border-amber-200">
              현장
            </span>
          )}
        </div>
        {!item.barcode && (
          <span className="mt-1 inline-block w-fit px-1 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px]">
            바코드 미등록
          </span>
        )}
      </div>
    </div>
  );
}
