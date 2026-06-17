// 스캔 불필요(scan_exempt) 판별.
// "(주문서동봉)" 같은 동봉/안내 인쇄물은 작업자가 챙기되 바코드 스캔 대상이 아니다.
// 품목명에 아래 키워드가 포함되면 자동으로 스캔 불필요로 본다(확장 가능).
//
// 운영 중 새 패턴이 나오면 배열에 한 단어씩 추가.
export const SCAN_EXEMPT_KEYWORDS = ["동봉"];

export function isScanExemptName(name: string | null | undefined): boolean {
  if (!name) return false;
  return SCAN_EXEMPT_KEYWORDS.some((k) => name.includes(k));
}
