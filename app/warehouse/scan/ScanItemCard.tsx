import { CheckCircle2, Circle, Hand } from "lucide-react";

// 검수 화면 제품 카드 — 이미지 위 + 정보 아래, 한 줄 5개.
//   - 바코드 있는 품목: 스캔으로 확인
//   - 바코드 없는 품목 + 동봉: 탭하면 수량 입력(수동 챙김)
//   - scan_exempt = 동봉 표시(배지)일 뿐, 검수에서 빠지지 않음(반드시 확인 필요)
// 검수 화면에서는 "아직 안 끝난 것"만 넘어오므로 보통 complete 카드는 안 보인다.

type ScanItemCardData = {
  itemId: number;
  name: string;
  quantity: number;
  scannedCount: number;
  barcode: string | null;
  hasImage: boolean;
  updatedAt: string;
  isAddedOnScan: boolean;
  scanExempt?: boolean; // 동봉 배지용
};

export default function ScanItemCard({
  item,
  highlighted = false,
  onPick,
}: {
  item: ScanItemCardData;
  highlighted?: boolean;
  onPick?: () => void; // 바코드 없는 품목 수동 챙김
}) {
  const { quantity, scannedCount } = item;
  const complete = scannedCount >= quantity && quantity > 0;
  const over = scannedCount > quantity && quantity > 0;
  const notStarted = scannedCount === 0;
  const manual = !item.barcode; // 바코드 없음 → 수동 챙김 대상
  const clickable = manual && !!onPick;

  const borderClass = over
    ? "border-red-400 ring-2 ring-red-200"
    : complete
      ? "border-green-400 bg-green-50"
      : manual
        ? "border-blue-300"
        : item.isAddedOnScan
          ? "border-amber-400"
          : "border-zinc-200";

  return (
    <div
      onClick={clickable ? onPick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick?.();
              }
            }
          : undefined
      }
      className={`relative border rounded-lg overflow-hidden bg-white flex flex-col transition-all ${borderClass} ${
        notStarted && !over ? "opacity-95" : ""
      } ${highlighted ? "shadow-md scale-[1.02]" : ""} ${
        clickable ? "cursor-pointer hover:shadow-md" : ""
      }`}
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
          {item.scanExempt && (
            <span className="px-1 py-0.5 rounded text-[11px] border bg-zinc-100 text-zinc-500 border-zinc-200">
              동봉
            </span>
          )}
          {item.isAddedOnScan && (
            <span className="px-1 py-0.5 rounded text-[11px] border bg-amber-50 text-amber-700 border-amber-200">
              현장
            </span>
          )}
        </div>
        {/* 바코드 없음 → 수동 챙김 안내 */}
        {manual && (
          <span className="mt-1 inline-flex items-center gap-1 w-fit px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px]">
            <Hand size={11} strokeWidth={1.75} />
            탭하여 수량 입력
          </span>
        )}
      </div>
    </div>
  );
}
