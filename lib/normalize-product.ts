// 매칭/마스터 등록에 쓸 정규화된 상품명을 생성한다.
// 운영 중 새 패턴이 발견되면 아래 REPLACEMENTS 배열에 한 줄씩 추가.
//
// 정규화 규칙 (현재):
//   1) "★"/"☆" 접두사 제거
//   2) "(증정샘플)" → "(샘플)" 통일
//   3) "(소비기한임박NkgN)..." → "(NkgN)..."
//   4) 트림 + 연속 공백 1칸으로 통일

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/^[★☆]+\s*/u, ""],
  [/\(증정샘플\)/g, "(샘플)"],
  [/\(소비기한임박([^)]+)\)/g, "($1)"],
];

export function normalizeProductName(rawName: string | null | undefined): string {
  if (!rawName) return "";
  let s = String(rawName).trim();
  for (const [re, rep] of REPLACEMENTS) {
    s = s.replace(re, rep);
  }
  return s.replace(/\s+/g, " ").trim();
}
