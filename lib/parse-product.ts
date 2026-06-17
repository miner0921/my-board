import { normalizeProductName } from "./normalize-product";
import { isScanExemptName } from "./scan-exempt";

// 상품명 문자열을 슬래시로 잘라 items + notes로 분리.
// 입력 예: "(1kg)악마초코1/(1kg)말차3/(파트너스스티커동봉)/★(증정샘플)망고1"
// 출력:
//   items: [
//     { rawName: "(1kg)악마초코",     normalizedName: "(1kg)악마초코",  qty: 1, isExempt: false },
//     { rawName: "(1kg)말차",         normalizedName: "(1kg)말차",      qty: 3, isExempt: false },
//     { rawName: "(파트너스스티커동봉)", normalizedName: "(파트너스스티커동봉)", qty: 1, isExempt: true },
//     { rawName: "★(증정샘플)망고",   normalizedName: "(샘플)망고",      qty: 1, isExempt: false },
//   ],
//   notes: []
//
// 규칙:
//   - "/" 로 split → 빈 토큰 무시
//   - 토큰 맨 앞의 "안내문 괄호 그룹"(예: (주문서동봉))은 별도 품목으로 분리하고
//     isExempt=true 로 표시. 그룹 바로 뒤 숫자가 있으면 그 수량으로.
//     → "(주문서동봉)(1kg)우베3" = [ (주문서동봉)×1(면제), (1kg)우베×3 ]
//   - 남은 부분: 끝 숫자가 있으면 item(rawName=숫자 제외, qty=끝 숫자), 없으면 notes.

export type ParsedProductItem = {
  rawName: string;
  normalizedName: string;
  qty: number;
  isExempt: boolean; // 스캔 불필요(동봉/안내) 품목
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

  const pushItem = (rawName: string, qty: number, isExempt: boolean) => {
    items.push({
      rawName,
      normalizedName: normalizeProductName(rawName),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      isExempt,
    });
  };

  for (const token of tokens) {
    let rest = token;

    // 1) 맨 앞의 안내문 괄호 그룹들을 별도 품목으로 분리 (예: (주문서동봉))
    //    그룹 바로 뒤 숫자가 있으면 수량으로 사용.
    while (true) {
      const m = rest.match(/^\(([^)]*)\)\s*(\d*)\s*/);
      if (!m) break;
      const groupText = `(${m[1]})`;
      if (!isScanExemptName(groupText)) break; // 안내문 아님(카테고리 등) → 상품의 일부
      const qty = m[2] ? parseInt(m[2], 10) : 1;
      pushItem(groupText, qty, true);
      rest = rest.slice(m[0].length);
    }

    // 2) 남은 부분 처리
    rest = rest.trim();
    if (rest === "") continue;

    const m2 = rest.match(/^(.*?)(\d+)\s*$/);
    if (m2 && m2[1].trim().length > 0) {
      const rawName = m2[1].trim();
      pushItem(rawName, parseInt(m2[2], 10), isScanExemptName(rawName));
    } else if (!/^\d+$/.test(rest)) {
      // 끝 숫자 없음 → 안내문/메모 (남은 게 순수 숫자뿐이면 무시)
      notes.push(rest);
    }
  }

  return { items, notes };
}
