// 매칭/마스터 등록에 쓸 정규화된 상품명을 생성한다.
//
// 정규화 규칙 (현재):
//   - 문자열 변환 + 트림 + 연속 공백 1칸으로 통일만.
//   - 의미 변환(★ 제거·(증정샘플)→(샘플)·(소비기한임박…) 제거)은 하지 않는다
//     → 원문이 다르면 서로 다른 품목으로 매칭/등록된다.

export function normalizeProductName(rawName: string | null | undefined): string {
  if (!rawName) return "";
  return String(rawName).trim().replace(/\s+/g, " ").trim();
}
