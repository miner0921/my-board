import * as XLSX from "xlsx";
import { buildItemName } from "./product-name";

// 발주서 / 송장 엑셀 파싱.
// 컬럼명은 실제 운영 파일 기준 (CLAUDE.md 도메인 설명 참고).

export type CustomerType = "business" | "individual" | "retail";

const SHEET_TO_TYPE: Record<string, CustomerType> = {
  "사업자": "business",
  "개인(일반)": "individual",
  "개인(소매넣기)": "retail",
};

export type OrderRow = {
  recipientName: string;
  recipientPhone: string;
  orderNo: string;
  productNameRaw: string;
  postalCode: string;
  address: string;
  deliveryNote: string;
  customerType: CustomerType;
};

export type InvoiceRow = {
  invoiceNo: string;
  orderNo: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  senderName: string;
  productNameRaw: string;
};

export type OrderParseResult = {
  rows: OrderRow[];
  sheetCounts: Record<CustomerType, number>;
};

// 발주서: 시트 "사업자" / "개인(일반)" / "개인(소매넣기)" 만 읽음.
// 기타 시트(요약 "발송건수" 등)는 무시.
export function parseOrderSheet(buffer: Buffer): OrderParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows: OrderRow[] = [];
  const sheetCounts: Record<CustomerType, number> = {
    business: 0,
    individual: 0,
    retail: 0,
  };

  for (const sheetName of wb.SheetNames) {
    const customerType = SHEET_TO_TYPE[sheetName];
    if (!customerType) continue;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const arr = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    for (const r of arr) {
      const orderNo = String(r["주문번호"] ?? "").trim();
      if (!orderNo) continue; // 빈 행 스킵
      rows.push({
        recipientName: String(r["받는분성명"] ?? "").trim(),
        recipientPhone: String(r["받는분전화번호"] ?? "").trim(),
        orderNo,
        productNameRaw: String(r["상품명"] ?? "").trim(),
        postalCode: String(r["받는분우편번호"] ?? "").trim(),
        address: String(r["주소"] ?? "").trim(),
        deliveryNote: String(r["배송메세지"] ?? "").trim(),
        customerType,
      });
      sheetCounts[customerType]++;
    }
  }

  return { rows, sheetCounts };
}

// 송장: 첫 시트(보통 Sheet0)만 읽음.
export function parseInvoiceSheet(buffer: Buffer): InvoiceRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) return [];
  const arr = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const rows: InvoiceRow[] = [];
  for (const r of arr) {
    const invoiceNo = String(r["운송장번호"] ?? "").trim();
    if (!invoiceNo) continue;
    rows.push({
      invoiceNo,
      orderNo: String(r["주문번호"] ?? "").trim(),
      recipientName: String(r["수하인명"] ?? "").trim(),
      // 송장은 "받는분 전화번호" (공백 있음), 발주서는 "받는분전화번호" (공백 없음)
      recipientPhone: String(r["받는분 전화번호"] ?? "").trim(),
      recipientAddress: String(r["수하인기본주소"] ?? "").trim(),
      senderName: String(r["송하인명"] ?? "").trim(),
      productNameRaw: String(r["상품명"] ?? "").trim(),
    });
  }
  return rows;
}

// ── 품목 대량 등록 (.xlsx / .csv) — SKU 마스터 양식 ──────────
// 19개 컬럼 중 헤더 "이름"으로 4개만 사용(위치 인덱스 아님): 품목코드/바코드/구분/종류.
// 첫 시트, 1행 헤더, 2행부터 데이터. 나머지 15개 컬럼은 무시.
// name(품명)은 buildItemName(구분, 종류) = 정규화 품명 — 검수 매칭 키.
// 매칭/갱신 판단 기준은 품목코드가 아니라 이 정규화 품명(lib/resolve-item.ts).
export type ItemUploadRow = {
  productCode: string | null;
  barcode: string | null;
  category: string; // 구분 (원본)
  kind: string; // 종류 (원본)
  name: string; // 정규화 품명 (buildItemName) — 매칭 키
  rowNo: number; // 엑셀 행 번호 (헤더=1, 데이터 첫 행=2) — 미리보기 표시용
};

export function parseItemsSheet(buffer: Buffer): ItemUploadRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) return [];
  const arr = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return arr.map((r, i) => {
    const productCodeRaw = String(r["품목코드"] ?? "").trim();
    const barcodeRaw = String(r["바코드"] ?? "").trim();
    const category = String(r["구분"] ?? "").trim();
    const kind = String(r["종류"] ?? "").trim();
    return {
      productCode: productCodeRaw === "" ? null : productCodeRaw,
      barcode: barcodeRaw === "" ? null : barcodeRaw,
      category,
      kind,
      name: buildItemName(category, kind),
      rowNo: i + 2,
    };
  });
}

// 한 주문번호가 여러 송장으로 분할되는 경우("/1","/2") 매칭 키
export function orderMatchKey(orderNo: string): string {
  return orderNo.replace(/\/\d+$/, "").trim();
}

// 발주서의 deliveryNote + 자동 파싱된 notes를 사람이 읽기 쉬운 형식으로 합침
export function combineDeliveryNote(
  orderNote: string,
  parsedNotes: string[]
): string | null {
  const order = (orderNote ?? "").trim();
  const auto =
    parsedNotes.length > 0
      ? "[자동 안내문]\n" + parsedNotes.map((n) => "- " + n).join("\n")
      : "";
  if (!order && !auto) return null;
  if (!order) return auto;
  if (!auto) return order;
  return `[배송메시지]\n${order}\n\n${auto}`;
}
