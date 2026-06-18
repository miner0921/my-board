// ─────────────────────────────────────────────────────────────
// 품명(name) 조합 단일 규칙 — 엑셀 대량등록·개별 등록/수정 공용.
//
// 품명 = "(구분)종류".  구분을 괄호로 감싸고 종류를 공백 없이 바로 붙인다.
//   예) 구분="1kg", 종류="악마초코"  → "(1kg)악마초코"
//   예) 구분="",     종류="악마초코"  → "악마초코"   (구분 없으면 종류만)
//
// ⚠️ 검수 매칭(confirm/scan)이 이 품명 문자열을 비교하므로 한 글자도 달라지면
//    매칭이 깨진다. 품명을 만드는 곳은 반드시 이 함수 하나만 쓸 것(복붙 금지).
//    또한 name/category/kind 세 값은 항상 같이 기록해 드리프트를 막는다.
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
