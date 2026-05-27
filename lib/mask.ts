// 개인정보 마스킹 유틸.
// 송장 목록/상세에서 수령인 정보를 표시할 때 사용.
// 정책:
//   이름   1자  → 그대로 (예: "홍")
//          2자  → "홍○"
//          3자+ → "홍○○..." (첫 글자만 노출, 나머지는 ○)
//   전화   "010-1234-5678" → "010-****-5678"   (앞 3 + 뒤 4)
//          숫자만 추출해서 처리. 자릿수 부족하면 원본 반환.
//   주소   공백 토큰 ≤3 → 원본 (이미 충분히 짧음)
//          그 외 → 앞 3토큰 + " ***"  (시/도 + 시 + 구·동까지)
// null/빈 문자열 → "-"

export function maskName(name: string | null | undefined): string {
  if (!name) return "-";
  const t = name.trim();
  if (t.length === 0) return "-";
  if (t.length === 1) return t;
  return t[0] + "○".repeat(t.length - 1);
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  const prefix = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${prefix}-****-${tail}`;
}

export function maskAddress(addr: string | null | undefined): string {
  if (!addr) return "-";
  const t = addr.trim();
  if (!t) return "-";
  const tokens = t.split(/\s+/);
  if (tokens.length <= 3) return t;
  return tokens.slice(0, 3).join(" ") + " ***";
}
