import { normalizeProductName } from "./normalize-product";

// ─────────────────────────────────────────────────────────────
// 품목 매칭 단일 지점 — confirm·scan·bulk·preview 모두 여기로 조회.
//
// 원칙: "같은 정규화 품명 = 같은 품목".
//   - 매칭 키 = normalizeProductName(name) (= itemMatchKey)
//   - 저장되는 name 도 이미 정규화형(buildItemName)이라 itemMatchKey 는 멱등.
//   - product_code·구분·종류·바코드는 품목의 "속성"일 뿐 매칭 키가 아니다.
//
// ⚠️ 별칭(alias)을 도입할 때는 buildItemIndex 안에서만 키를 합칠 것.
//    호출 측은 itemMatchKey/buildItemIndex 만 쓰므로 매칭 규칙이 한 곳에 모인다.
// ─────────────────────────────────────────────────────────────

// 품목 매칭 키 — 품명을 정규화한 문자열.
export function itemMatchKey(name: string | null | undefined): string {
  return normalizeProductName(name);
}

// 기존 items 행들을 "매칭 키 → id" 인덱스로 변환.
// 같은 키가 여럿이면 마지막 행이 우선(기존 confirm 동작과 동일).
// 입력은 { id, name } 만 있으면 됨(트랜잭션/일반 쿼리 모두에서 재사용).
export function buildItemIndex(
  items: { id: number; name: string }[]
): Map<string, number> {
  const index = new Map<string, number>();
  for (const it of items) {
    index.set(itemMatchKey(it.name), it.id);
  }
  return index;
}
