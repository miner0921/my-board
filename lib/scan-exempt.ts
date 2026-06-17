// 동봉 품목 판별 (배지 표시용).
//
// ⚠️ items.scan_exempt 컬럼은 이제 "동봉(안내 인쇄물) 표시용"이다.
//    더 이상 "검수 제외(안 찍어도 완료)"가 아니다 — 동봉도 수동 챙김으로
//    반드시 확인해야 검수 완료된다. scan_exempt=true 는 화면에서 "동봉" 배지로만
//    구분 표시하는 용도. (컬럼명은 과거 이름 유지, 마이그레이션 회피)
//
// 품목명에 아래 키워드가 있으면 동봉으로 본다(확장 가능).
export const SCAN_EXEMPT_KEYWORDS = ["동봉"];

// 동봉 여부(=배지). 업로드/대량등록 시 items.scan_exempt 자동 세팅에 사용.
export function isScanExemptName(name: string | null | undefined): boolean {
  if (!name) return false;
  return SCAN_EXEMPT_KEYWORDS.some((k) => name.includes(k));
}
