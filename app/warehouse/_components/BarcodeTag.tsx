// 바코드 표시 원자 — 바코드가 있으면 모노스페이스 텍스트, 없으면 "바코드 미등록"
// 호박색 배지. 송장 상세 / 품목 목록 / 검수 화면이 공통으로 사용.
// (presentational — 서버/클라이언트 양쪽에서 사용 가능)

export default function BarcodeTag({
  barcode,
  className = "",
}: {
  barcode: string | null;
  className?: string;
}) {
  if (barcode) {
    return (
      <span
        className={`font-mono text-[11px] text-zinc-500 truncate ${className}`}
      >
        {barcode}
      </span>
    );
  }
  return (
    <span
      className={`inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] whitespace-nowrap ${className}`}
    >
      바코드 미등록
    </span>
  );
}
