import { normalizeProductName } from "./normalize-product";

// 상품명 문자열을 슬래시로 잘라 items + notes로 분리.
// 입력 예: "(1kg)악마초코1/(1kg)말차3/(파트너스스티커동봉)/★(증정샘플)망고1"
// 출력:
//   items: [
//     { rawName: "(1kg)악마초코",     normalizedName: "(1kg)악마초코",  qty: 1 },
//     { rawName: "(1kg)말차",         normalizedName: "(1kg)말차",      qty: 3 },
//     { rawName: "★(증정샘플)망고",   normalizedName: "(샘플)망고",      qty: 1 },
//   ],
//   notes: ["(파트너스스티커동봉)"]
//
// 규칙:
//   - "/" 로 split → 빈 토큰 무시
//   - 토큰의 끝에 숫자가 있으면 itemS (rawName = 숫자 제외, qty = 끝 숫자)
//   - 끝 숫자 없으면 notes 로

export type ParsedProductItem = {
  rawName: string;
  normalizedName: string;
  qty: number;
};

export type ParsedProduct = {
  items: ParsedProductItem[];
  notes: string[];
};

export function parseProductName(
  input: string | null | undefined
): ParsedProduct {
  if (!input) return { items: [], notes: [] };
  const tokens = String(input)
    .split("/")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const items: ParsedProductItem[] = [];
  const notes: string[] = [];

  for (const token of tokens) {
    // 끝의 \d+를 수량으로 본다. 앞부분(.*?)이 비어있지 않아야 진짜 품목.
    const m = token.match(/^(.*?)(\d+)\s*$/);
    if (m && m[1].trim().length > 0) {
      const rawName = m[1].trim();
      const qty = parseInt(m[2], 10);
      items.push({
        rawName,
        normalizedName: normalizeProductName(rawName),
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      });
    } else {
      // 끝 숫자 없음 → 안내문/메모
      notes.push(token);
    }
  }

  return { items, notes };
}
