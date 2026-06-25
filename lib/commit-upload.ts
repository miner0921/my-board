import type { PoolClient } from "pg";
import {
  parseOrderSheet,
  parseInvoiceSheet,
  orderMatchKey,
  combineDeliveryNote,
  type OrderRow,
  type InvoiceRow,
} from "@/lib/parse-excel";
import { parseProductName } from "@/lib/parse-product";
import { loadItemIndex } from "@/lib/resolve-item";
import { isScanExemptName } from "@/lib/scan-exempt";

// 파싱 실패를 호출측에서 400으로 매핑하기 위한 전용 에러.
export class UploadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadParseError";
  }
}

export type CommitUploadParams = {
  orderBuffer: Buffer;
  invoiceBuffer: Buffer;
  orderFilename: string;
  invoiceFilename: string;
  orderMime: string | null;
  invoiceMime: string | null;
  userId: number;
  // null/undefined → 새 committed batch 생성(동시 업로드, 기존 confirm 동작)
  // 숫자 → 기존 waiting batch를 committed로 승격(파일은 이미 그 batch에 저장돼 있음)
  existingBatchId?: number | null;
};

export type CommitUploadSummary = {
  insertedItems: number;
  insertedInvoices: number;
  skippedInvoices: number;
  batchId: number;
};

// 발주서+송장 버퍼로 품목/송장/매핑을 만들고 upload_batch를 committed로 만든다.
// ★ 매칭·파싱·items/invoices/invoice_items/invoice_uploads 로직은 기존 confirm에서
//   "그대로" 옮긴 것(동작 불변). batch 처리만 existingBatchId로 분기한다.
//   유일한 신규 동작: upload_batches 행에 집계 3컬럼 기록(027 ledger 통합).
// 반드시 호출측 withTransaction(client) 안에서 호출할 것.
export async function commitUploadBatch(
  client: PoolClient,
  params: CommitUploadParams
): Promise<CommitUploadSummary> {
  const userId = params.userId;

  // ── 파싱 (실패 시 UploadParseError → 호출측에서 400) ──
  let orderRows: OrderRow[];
  let invoiceRows: InvoiceRow[];
  try {
    orderRows = parseOrderSheet(params.orderBuffer).rows;
    invoiceRows = parseInvoiceSheet(params.invoiceBuffer);
  } catch (e) {
    console.error("엑셀 파싱 실패:", e);
    throw new UploadParseError(
      "엑셀 파일을 읽을 수 없습니다. 파일을 확인해주세요."
    );
  }

  // 발주서 매칭 맵
  const orderMap = new Map<string, OrderRow[]>();
  for (const r of orderRows) {
    const key = orderMatchKey(r.orderNo);
    const arr = orderMap.get(key) ?? [];
    arr.push(r);
    orderMap.set(key, arr);
  }

  type Pair = { invoice: InvoiceRow; order: OrderRow | null };
  const pairs: Pair[] = invoiceRows.map((inv) => {
    const hits = orderMap.get(orderMatchKey(inv.orderNo));
    return { invoice: inv, order: hits && hits.length > 0 ? hits[0] : null };
  });

  // 1. 기존 items + 별칭 → 정규화 품명 인덱스 (매칭 단일 지점, 별칭 인식)
  const itemByNormalized = await loadItemIndex((t) => client.query(t));

  // 2. 새 품목 식별 (전체 송장 순회)
  const newItems = new Set<string>();
  for (const p of pairs) {
    const raw = p.invoice.productNameRaw || p.order?.productNameRaw || "";
    const parsed = parseProductName(raw);
    for (const it of parsed.items) {
      if (!itemByNormalized.has(it.normalizedName)) {
        newItems.add(it.normalizedName);
      }
    }
  }

  // 3. 새 품목 INSERT (barcode NULL, 자동 등록 표시)
  // is_auto_created=TRUE → 다른 사용자도 바코드/이름/이미지 보완 가능
  let insertedItems = 0;
  for (const norm of newItems) {
    const r = await client.query(
      `INSERT INTO items (name, barcode, image_data, image_mime, created_by, is_auto_created, scan_exempt)
       VALUES ($1, NULL, NULL, NULL, $2, TRUE, $3)
       RETURNING id`,
      [norm, userId, isScanExemptName(norm)]
    );
    itemByNormalized.set(norm, r.rows[0].id);
    insertedItems++;
  }

  // 3-1. 업로드 묶음 — 새로 만들거나(동시 업로드) 기존 waiting batch를 쓴다(승격).
  let batchId: number;
  if (params.existingBatchId == null) {
    // 새 committed batch (기존 confirm 동작 그대로 — 두 파일 바이트+메타 저장)
    const batchRes = await client.query(
      `INSERT INTO upload_batches (
         order_file_data, order_filename, order_mime, order_uploaded_by, order_uploaded_at,
         invoice_file_data, invoice_filename, invoice_mime, invoice_uploaded_by, invoice_uploaded_at,
         status, created_by
       )
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, NOW(), 'committed', $9)
       RETURNING id`,
      [
        params.orderBuffer,
        params.orderFilename,
        params.orderMime,
        userId,
        params.invoiceBuffer,
        params.invoiceFilename,
        params.invoiceMime,
        userId,
        userId,
      ]
    );
    batchId = batchRes.rows[0].id;
  } else {
    // 기존 waiting batch 승격 — 파일은 이미 저장됨. status는 뒤에서 committed로 전환.
    batchId = params.existingBatchId;
  }

  // 4. invoices + invoice_items INSERT (송장 모두 등록, onlyInOrder는 등록 X)
  let insertedInvoices = 0;
  let skippedInvoices = 0;

  for (const p of pairs) {
    const raw = p.invoice.productNameRaw || p.order?.productNameRaw || "";
    const parsed = parseProductName(raw);
    const deliveryNote = combineDeliveryNote(
      p.order?.deliveryNote ?? "",
      parsed.notes
    );

    const invRes = await client.query(
      `INSERT INTO invoices (
         invoice_no, status,
         recipient_name, recipient_phone, recipient_address,
         recipient_postal_code, delivery_note, order_no,
         raw_product_name, sender_name, customer_type, created_by,
         upload_batch_id
       )
       VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (invoice_no) DO NOTHING
       RETURNING id`,
      [
        p.invoice.invoiceNo,
        p.invoice.recipientName || p.order?.recipientName || null,
        p.invoice.recipientPhone || p.order?.recipientPhone || null,
        p.order?.address || p.invoice.recipientAddress || null,
        p.order?.postalCode || null,
        deliveryNote,
        p.invoice.orderNo || p.order?.orderNo || null,
        raw || null,
        p.invoice.senderName || null,
        p.order?.customerType ?? null,
        userId,
        batchId,
      ]
    );

    if (invRes.rows.length === 0) {
      // 이미 같은 invoice_no 가 있어서 INSERT 안 됨 → SKIP
      skippedInvoices++;
      continue;
    }
    const invoiceId = invRes.rows[0].id;
    insertedInvoices++;

    // invoice_items
    for (const it of parsed.items) {
      const itemId = itemByNormalized.get(it.normalizedName);
      if (!itemId) continue;
      await client.query(
        `INSERT INTO invoice_items
           (invoice_id, item_id, quantity, scanned_count, display_name)
         VALUES ($1, $2, $3, 0, $4)
         ON CONFLICT (invoice_id, item_id) DO UPDATE
           SET quantity = invoice_items.quantity + EXCLUDED.quantity`,
        [invoiceId, itemId, it.qty, it.rawName]
      );
    }
  }

  // 4-1. batch 집계 + 새 품목 이름 기록 + (승격이면) committed로 전환. (027·028)
  //      새 batch는 위에서 이미 committed로 INSERT됨 — 집계/이름만 채운다.
  const newItemNames = Array.from(newItems); // 028: 상세 보기용 새 품목 이름
  if (params.existingBatchId == null) {
    await client.query(
      `UPDATE upload_batches
         SET inserted_items = $2, inserted_invoices = $3, skipped_invoices = $4,
             inserted_item_names = $5, updated_at = NOW()
       WHERE id = $1`,
      [batchId, insertedItems, insertedInvoices, skippedInvoices, newItemNames]
    );
  } else {
    await client.query(
      `UPDATE upload_batches
         SET status = 'committed',
             inserted_items = $2, inserted_invoices = $3, skipped_invoices = $4,
             inserted_item_names = $5, updated_at = NOW()
       WHERE id = $1`,
      [batchId, insertedItems, insertedInvoices, skippedInvoices, newItemNames]
    );
  }

  // 5. 업로드 이력 ledger (하위호환 — invoice_uploads 병행 기록). 같은 트랜잭션이라 원자적.
  await client.query(
    `INSERT INTO invoice_uploads
       (order_filename, invoice_filename,
        inserted_items, inserted_invoices, skipped_invoices, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.orderFilename,
      params.invoiceFilename,
      insertedItems,
      insertedInvoices,
      skippedInvoices,
      userId,
    ]
  );

  return { insertedItems, insertedInvoices, skippedInvoices, batchId };
}
