import { normalizeProductName } from "./normalize-product";
import type { ItemUploadRow } from "./parse-excel";

// ─────────────────────────────────────────────────────────────
// 품목 대량 등록 분류 로직 (미리보기·확정 공용 — 복붙 방지).
//
// 판단 기준은 반드시 "정규화된 품목명" (바코드 아님).
//   - 묶음 A에서 바코드 중복을 허용했으므로 바코드로 판단하면 안 됨.
//   - 같은 정규화 품목명이 기존 DB(또는 파일 내 앞 행)에 있으면 update(바코드만 갱신),
//     없으면 create.
//   - 품목명 빈 행 / 길이 초과 행은 skip.
// ─────────────────────────────────────────────────────────────

export const MAX_NAME_LEN = 200;
export const MAX_BARCODE_LEN = 100;

export type BulkAction = "create" | "update" | "skip";

export type ClassifiedRow = {
  rowNo: number;
  name: string;
  barcode: string | null;
  normalized: string;
  action: BulkAction;
  reason?: string; // skip 사유 (사용자 안내용)
};

export type BulkCounts = { create: number; update: number; skip: number };

// rows를 위에서부터 순회하며 분류.
// knownNormalized: 기존 DB 품목의 정규화명 집합 (호출 측에서 주입).
//   파일 내에서 새로 create로 잡힌 정규화명도 누적해, 파일 내 중복은
//   뒤 행이 앞 행을 덮어쓰는(update) 것으로 일관 처리한다.
export function classifyBulkItems(
  rows: ItemUploadRow[],
  knownNormalized: Set<string>
): { rows: ClassifiedRow[]; counts: BulkCounts } {
  const known = new Set(knownNormalized);
  const counts: BulkCounts = { create: 0, update: 0, skip: 0 };

  const classified = rows.map((r): ClassifiedRow => {
    const normalized = normalizeProductName(r.name);

    if (normalized === "") {
      counts.skip++;
      return { ...r, normalized, action: "skip", reason: "품목명 없음" };
    }
    if (r.name.length > MAX_NAME_LEN) {
      counts.skip++;
      return { ...r, normalized, action: "skip", reason: "품목명 200자 초과" };
    }
    if (r.barcode !== null && r.barcode.length > MAX_BARCODE_LEN) {
      counts.skip++;
      return { ...r, normalized, action: "skip", reason: "바코드 100자 초과" };
    }

    if (known.has(normalized)) {
      counts.update++;
      return { ...r, normalized, action: "update" };
    }
    known.add(normalized);
    counts.create++;
    return { ...r, normalized, action: "create" };
  });

  return { rows: classified, counts };
}
