import { normalizeProductName } from "./normalize-product";

// ─────────────────────────────────────────────────────────────
// 품명(name) 조합 단일 규칙 — 엑셀 대량등록·개별 등록/수정 공용.
//
// 1) 조합:   품명 = "(구분)종류".  구분을 괄호로 감싸고 종류를 공백 없이 붙인다.
//      예) 구분="1kg", 종류="악마초코" → "(1kg)악마초코"
//      예) 구분="",    종류="악마초코" → "악마초코"   (구분 없으면 종류만)
// 2) 정규화: 저장되는 name 은 조합 결과를 normalizeProductName 으로 한 번 더 정리한
//    "정규화형"이다(★/증정샘플 등 제거 → 검수 매칭 키와 동일 규칙). → buildItemName
//
// 불변식: items.name === normalizeProductName(composeProductName(구분, 종류))
//   - 구분(category)/종류(kind)는 입력 원본을 그대로 보존(표시·재편집용).
//   - name 은 매칭 키(= itemMatchKey, lib/resolve-item.ts)와 같은 정규화형.
//
// ⚠️ 검수 매칭(confirm/scan)이 정규화 품명을 비교하므로 한 글자도 달라지면 매칭이
//    깨진다. name 을 만드는 곳은 반드시 buildItemName 하나만 쓸 것(복붙 금지).
// ─────────────────────────────────────────────────────────────

// 품목 필드 길이 제한 (DB 컬럼 길이와 일치 — 검증 단일 출처)
export const MAX_PRODUCT_CODE_LEN = 100;
export const MAX_CATEGORY_LEN = 100;
export const MAX_KIND_LEN = 200;
export const MAX_NAME_LEN = 200;
export const MAX_BARCODE_LEN = 100;

export function composeProductName(
  category: string | null | undefined,
  kind: string | null | undefined
): string {
  const c = String(category ?? "").trim();
  const k = String(kind ?? "").trim();
  return c ? `(${c})${k}` : k;
}

// 저장용 정규화 품명(캐논 키). 조합 → 정규화. 매칭 키와 같은 규칙.
// 저장되는 items.name 은 항상 이 함수의 결과여야 한다(엑셀·개별 공용).
export function buildItemName(
  category: string | null | undefined,
  kind: string | null | undefined
): string {
  return normalizeProductName(composeProductName(category, kind));
}

// 개별 등록(POST)/수정(PUT) 공용 — 입력 검증 + 정규화 품명 조합을 한 곳에.
// (양쪽에 흩어져 있던 동일 길이 검증을 단일 출처로 모음.)
export type ItemFieldsInput = {
  productCodeRaw: string;
  category: string;
  kind: string;
  barcodeRaw: string;
};
export type ItemFieldsResult =
  | {
      ok: true;
      name: string; // 정규화형 (buildItemName)
      category: string; // 구분 (trim, 원본 보존)
      kind: string; // 종류 (trim, 원본 보존)
      productCode: string | null; // 빈 문자열은 NULL
      barcode: string | null; // 빈 문자열은 NULL
    }
  | { ok: false; error: string };

export function buildItemFields(input: ItemFieldsInput): ItemFieldsResult {
  const productCodeRaw = input.productCodeRaw.trim();
  const category = input.category.trim();
  const kind = input.kind.trim();
  const barcodeRaw = input.barcodeRaw.trim();

  // name 은 정규화형으로만 생성 — 구분/종류는 원본 보존
  const name = buildItemName(category, kind);

  if (!kind) return { ok: false, error: "종류(품명)를 입력해주세요." };
  if (productCodeRaw.length > MAX_PRODUCT_CODE_LEN)
    return { ok: false, error: "품목코드는 100자 이하여야 합니다." };
  if (category.length > MAX_CATEGORY_LEN)
    return { ok: false, error: "구분은 100자 이하여야 합니다." };
  if (kind.length > MAX_KIND_LEN)
    return { ok: false, error: "종류는 200자 이하여야 합니다." };
  if (barcodeRaw.length > MAX_BARCODE_LEN)
    return { ok: false, error: "바코드는 100자 이하여야 합니다." };
  if (name.length > MAX_NAME_LEN)
    return { ok: false, error: "구분+종류로 조합한 품명이 200자를 초과합니다." };

  return {
    ok: true,
    name,
    category,
    kind,
    productCode: productCodeRaw === "" ? null : productCodeRaw,
    barcode: barcodeRaw === "" ? null : barcodeRaw,
  };
}

// composeProductName 의 역산 — 품명에서 구분/종류를 분리한다(표시 전용).
//   "(구분)종류" 형식(맨 앞 괄호 + 닫는 괄호 뒤 내용 존재)이면 분리,
//   아니면(괄호 없음/뒤가 비어있음 등) 구분은 빈칸, 종류에 품명 전체.
// ⚠️ 저장은 항상 composeProductName 로 다시 합친다. 이 함수는 모델을 바꾸지 않음.
//   어떤 경우든 composeProductName(category, kind) === 원래 품명(무손실 역산).
export function splitProductName(name: string | null | undefined): {
  category: string;
  kind: string;
} {
  const s = String(name ?? "").trim();
  const m = s.match(/^\(([^)]+)\)(.+)$/);
  if (m) return { category: m[1], kind: m[2] };
  return { category: "", kind: s };
}
