import type { ItemUploadRow } from "./parse-excel";
import { itemMatchKey } from "./resolve-item";
import {
  MAX_PRODUCT_CODE_LEN,
  MAX_BARCODE_LEN,
  MAX_NAME_LEN,
} from "./product-name";

// ─────────────────────────────────────────────────────────────
// 품목 대량 등록 분류 로직 (미리보기·확정 공용 — 복붙 방지).
//
// 판단 기준은 "정규화 품명"(itemMatchKey(row.name)) — 품목코드가 아니다.
//   - 같은 정규화 품명이 기존 DB(또는 파일 내 앞 행)에 있으면 update
//     (품목코드/구분/종류/바코드 채움·갱신), 없으면 create.
//   - 품명 없는 행 / 길이 초과 행은 skip. (품목코드는 이제 선택 속성)
//   - 품명이 다르면 새 품목으로 등록(개명은 개별 수정으로).
// ─────────────────────────────────────────────────────────────

export type BulkAction = "create" | "update" | "skip";

export type ClassifiedRow = ItemUploadRow & {
  action: BulkAction;
  reason?: string; // skip 사유 (사용자 안내용)
};

export type BulkCounts = { create: number; update: number; skip: number };

// rows를 위에서부터 순회하며 분류.
// knownKeys: 기존 DB 품목의 정규화 품명 집합 (호출 측에서 주입).
//   파일 내에서 새로 create로 잡힌 품명도 누적해, 파일 내 중복은
//   뒤 행이 앞 행을 덮어쓰는(update) 것으로 일관 처리한다.
export function classifyBulkItems(
  rows: ItemUploadRow[],
  knownKeys: Set<string>
): { rows: ClassifiedRow[]; counts: BulkCounts } {
  const known = new Set(knownKeys);
  const counts: BulkCounts = { create: 0, update: 0, skip: 0 };

  const classified = rows.map((r): ClassifiedRow => {
    const skip = (reason: string): ClassifiedRow => {
      counts.skip++;
      return { ...r, action: "skip", reason };
    };

    if (r.name === "") return skip("종류(품명) 없음");
    if (r.name.length > MAX_NAME_LEN) return skip("품명(구분+종류) 200자 초과");
    if (r.productCode !== null && r.productCode.length > MAX_PRODUCT_CODE_LEN)
      return skip("품목코드 100자 초과");
    if (r.barcode !== null && r.barcode.length > MAX_BARCODE_LEN)
      return skip("바코드 100자 초과");

    const key = itemMatchKey(r.name);
    if (known.has(key)) {
      counts.update++;
      return { ...r, action: "update" };
    }
    known.add(key);
    counts.create++;
    return { ...r, action: "create" };
  });

  return { rows: classified, counts };
}
