import { query } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// 입고증 조회 한 곳. 상세 페이지 / 현장 스캔 화면 / API 두 곳이 같이 쓴다.
// (id 로도, 바코드 문자열(receipt_no)로도 같은 모양을 돌려준다)
// ─────────────────────────────────────────────────────────────

export type ReceiptRow = {
  id: number;
  receipt_no: string;
  title: string | null;
  status: string; // open / received / canceled
  created_at: Date;
  received_at: Date | null;
  author_nickname: string | null;
};

export type ReceiptItemRow = {
  id: number;
  item_id: number;
  name: string;
  barcode: string | null;
  expiry_managed: boolean;
  expiry_date: string | null; // 예정 소비기한 'YYYY-MM-DD' (048)
  planned_quantity: number;
  received_quantity: number;
  has_image: boolean;
};

export type ReceiptFull = { receipt: ReceiptRow; items: ReceiptItemRow[] };

// receipt_no 는 'RC' + 7자리. 스캐너가 앞뒤 공백을 흘릴 수 있어 trim + 대문자화.
export function normalizeReceiptNo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return /^RC\d{1,12}$/.test(s) ? s : null;
}

export async function loadReceipt(
  key: { id: number } | { receiptNo: string }
): Promise<ReceiptFull | null> {
  const byId = "id" in key;
  const res = await query(
    `SELECT r.id, r.receipt_no, r.title, r.status, r.created_at, r.received_at,
            u.nickname AS author_nickname
       FROM stock_receipts r
       LEFT JOIN users u ON u.id = r.created_by
      WHERE ${byId ? "r.id = $1" : "r.receipt_no = $1"}
        AND r.deleted_at IS NULL`,
    [byId ? key.id : key.receiptNo]
  );
  if (res.rows.length === 0) return null;
  const receipt = res.rows[0] as ReceiptRow;

  const items = await query(
    `SELECT ri.id, ri.item_id, ri.planned_quantity, ri.received_quantity,
            ri.expiry_date::text AS expiry_date,
            i.name, i.barcode, i.expiry_managed,
            (i.image_data IS NOT NULL) AS has_image
       FROM stock_receipt_items ri
       JOIN items i ON i.id = ri.item_id
      WHERE ri.receipt_id = $1
      ORDER BY i.name ASC, ri.expiry_date ASC NULLS LAST, ri.id ASC`,
    [receipt.id]
  );

  return { receipt, items: items.rows as ReceiptItemRow[] };
}
