// [시험용] 검수 화면 제품 카드 표시 순서 정렬.
//   1) 방금 찍은 카드(lastScannedId) → 맨 앞
//   2) 아직 안 찍은 것(scanned_count === 0) → 중간
//   3) 찍은 것(scanned_count > 0) → 맨 뒤
// 같은 그룹 안에서는 원래 순서 유지(JS sort는 안정 정렬).
// 원본 배열은 건드리지 않고 새 배열 반환.
//
// 되돌리기: page.tsx의 SORT_BY_SCAN 플래그를 false로 두면 등록순 고정으로 복귀.

type SortableItem = {
  invoice_item_id: number;
  scanned_count: number;
};

export function sortScanItems<T extends SortableItem>(
  items: T[],
  lastScannedId: number | null
): T[] {
  const rank = (it: T): number => {
    if (lastScannedId !== null && it.invoice_item_id === lastScannedId) return 0;
    if (it.scanned_count === 0) return 1;
    return 2;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}
