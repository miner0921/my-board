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

// 기존 items 행들(+ 별칭)을 "매칭 키 → id" 인덱스로 변환.
// 같은 키가 여럿이면 마지막 행이 우선(기존 confirm 동작과 동일).
// 입력은 { id, name } 만 있으면 됨(트랜잭션/일반 쿼리 모두에서 재사용).
//
// 별칭(item_aliases)은 "또 다른 정규화 품명 → 같은 item_id".
//   - normalized_alias 는 저장 시 이미 itemMatchKey 로 정규화됨 → 그대로 사용(멱등).
//   - 실제 품목 품명이 우선 — 별칭이 품목 품명 키를 덮어쓰지 않는다.
export function buildItemIndex(
  items: { id: number; name: string }[],
  aliases: { item_id: number; normalized_alias: string }[] = []
): Map<string, number> {
  const index = new Map<string, number>();
  for (const it of items) {
    index.set(itemMatchKey(it.name), it.id);
  }
  for (const a of aliases) {
    if (!index.has(a.normalized_alias)) {
      index.set(a.normalized_alias, a.item_id);
    }
  }
  return index;
}

// 매칭 조회 단일 지점 — items + 별칭을 함께 읽어 인덱스로.
// run: (text) => Promise<{ rows }> (lib/db 의 query 또는 트랜잭션 client.query 래핑).
// ⚠️ 송장 매칭(confirm/preview)에서만 사용. 대량등록 upsert 는 품목 name 기준이라
//    별칭을 넣지 않는다(마스터 품명 오염 방지).
type QueryRunner = (text: string) => Promise<{ rows: unknown[] }>;
export async function loadItemIndex(
  run: QueryRunner
): Promise<Map<string, number>> {
  const itemsRes = await run(
    "SELECT id, name FROM items WHERE deleted_at IS NULL"
  );
  const aliasRes = await run(
    `SELECT a.item_id, a.normalized_alias
       FROM item_aliases a
       JOIN items i ON i.id = a.item_id
      WHERE i.deleted_at IS NULL`
  );
  return buildItemIndex(
    itemsRes.rows as { id: number; name: string }[],
    aliasRes.rows as { item_id: number; normalized_alias: string }[]
  );
}
