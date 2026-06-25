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
  // 발주서/송장 파일이 여러 개일 수 있음 → 버퍼 배열. 파싱 후 행을 concat해 매칭.
  orderBuffers: Buffer[];
  invoiceBuffers: Buffer[];
  userId: number;
  // 파일은 이미 upload_files에 저장돼 있고, batch 헤더도 호출측이 생성/확보한 상태.
  batchId: number;
};

export type CommitUploadSummary = {
  insertedItems: number;
  insertedInvoices: number;
  skippedInvoices: number;
  batchId: number;
};

// 발주서+송장 버퍼(여러 개)로 품목/송장/매핑을 만들고 batch를 committed로 마무리.
// ★ 매칭·파싱·items/invoices/invoice_items 로직은 기존과 "글자단위 동일".
//   바뀐 것: ① 입력을 단일 버퍼 → 버퍼 배열로 파싱·concat ② 파일 저장은 호출측(upload_files)
//   ③ batch는 항상 기존 행을 UPDATE(임베드 INSERT 제거).
// 반드시 호출측 withTransaction(client) 안에서 호출할 것.
export async function commitUploadBatch(
  client: PoolClient,
  params: CommitUploadParams
): Promise<CommitUploadSummary> {
  const userId = params.userId;
  const batchId = params.batchId;

  // ── 여러 파일 파싱 → 행 concat (입력 조립만; 파싱 함수 자체는 불변) ──
  const orderRows: OrderRow[] = [];
  const invoiceRows: InvoiceRow[] = [];
  try {
    for (const buf of params.orderBuffers) {
      orderRows.push(...parseOrderSheet(buf).rows);
    }
    for (const buf of params.invoiceBuffers) {
      invoiceRows.push(...parseInvoiceSheet(buf));
    }
  } catch (e) {
    console.error("엑셀 파싱 실패:", e);
    throw new UploadParseError(
      "엑셀 파일을 읽을 수 없습니다. 파일을 확인해주세요."
    );
  }

  // ===== 이하 매칭·등록 로직: 기존 confirm/commit과 글자단위 동일 =====

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

  // (가산·읽기만) 발주서-only 집계 — 송장에 매칭되지 않은 발주서 행.
  // 매칭 규칙은 위 pairs/orderMap이 산출한 것 그대로 읽어 분류만 계산(동작 불변).
  const usedOrderKeys = new Set<string>();
  for (const inv of invoiceRows) {
    const key = orderMatchKey(inv.orderNo);
    if (orderMap.has(key)) usedOrderKeys.add(key);
  }
  const unmatchedOrderNos: string[] = [];
  for (const [key, rows] of orderMap.entries()) {
    if (!usedOrderKeys.has(key)) {
      for (const r of rows) unmatchedOrderNos.push(r.orderNo);
    }
  }

  // 1. 기존 items + 별칭 → 정규화 품명 인덱스 (매칭 단일 지점, 별칭 인식)
  const itemByNormalized = await loadItemIndex((t) => client.query(t));

  // 2. 새 품목 식별 (전체 송장 순회)
  const newItems = new Set<string>();
  for (const p of pairs) {
    const raw = p.order?.productNameRaw || p.invoice.productNameRaw || "";
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

  // 4. invoices + invoice_items INSERT (송장 모두 등록, onlyInOrder는 등록 X)
  let insertedInvoices = 0;
  let skippedInvoices = 0;

  for (const p of pairs) {
    const raw = p.order?.productNameRaw || p.invoice.productNameRaw || "";
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
         upload_batch_id, match_tag
       )
       VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        // (가산) 매칭 태그 — pairs가 이미 산출한 분류를 기록만
        p.order ? "matched" : "invoice_only",
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

  // ===== 매칭·등록 로직 끝 (위까지 기존과 동일) =====

  // 5. batch 마무리: committed + 집계 + 새 품목 이름 기록.
  const newItemNames = Array.from(newItems); // 028: 상세 보기용
  await client.query(
    `UPDATE upload_batches
        SET status = 'committed',
            inserted_items = $2, inserted_invoices = $3, skipped_invoices = $4,
            inserted_item_names = $5,
            unmatched_order_count = $6, unmatched_order_nos = $7,
            updated_at = NOW()
      WHERE id = $1`,
    [
      batchId,
      insertedItems,
      insertedInvoices,
      skippedInvoices,
      newItemNames,
      unmatchedOrderNos.length,
      unmatchedOrderNos,
    ]
  );

  return { insertedItems, insertedInvoices, skippedInvoices, batchId };
}
