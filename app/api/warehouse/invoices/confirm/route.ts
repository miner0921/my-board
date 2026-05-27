import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withTransaction } from "@/lib/db";
import { readUploadedXlsx } from "@/lib/upload";
import {
  parseOrderSheet,
  parseInvoiceSheet,
  orderMatchKey,
  combineDeliveryNote,
  type OrderRow,
  type InvoiceRow,
} from "@/lib/parse-excel";
import { parseProductName } from "@/lib/parse-product";
import { normalizeProductName } from "@/lib/normalize-product";
import { logAccess } from "@/lib/audit";

// POST: 같은 발주서/송장 파일 두 개를 다시 받아 트랜잭션으로 실제 저장.
// preview의 출력을 신뢰하지 않고 서버에서 재분석한다(클라이언트 위·변조 방지).
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const orderFile = formData.get("order");
    const invoiceFile = formData.get("invoice");
    if (!(orderFile instanceof File) || !(invoiceFile instanceof File)) {
      return NextResponse.json(
        { error: "발주서와 송장 파일을 모두 업로드해주세요." },
        { status: 400 }
      );
    }

    const orderRead = await readUploadedXlsx(orderFile);
    if (!orderRead.ok) {
      return NextResponse.json(
        { error: `발주서: ${orderRead.error}` },
        { status: 400 }
      );
    }
    const invoiceRead = await readUploadedXlsx(invoiceFile);
    if (!invoiceRead.ok) {
      return NextResponse.json(
        { error: `송장: ${invoiceRead.error}` },
        { status: 400 }
      );
    }

    let orderRows: OrderRow[];
    let invoiceRows: InvoiceRow[];
    try {
      orderRows = parseOrderSheet(orderRead.buffer).rows;
      invoiceRows = parseInvoiceSheet(invoiceRead.buffer);
    } catch (e) {
      console.error("엑셀 파싱 실패:", e);
      return NextResponse.json(
        { error: "엑셀 파일을 읽을 수 없습니다. 파일을 확인해주세요." },
        { status: 400 }
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

    const userId = Number(session.user.id);

    let summary: {
      insertedItems: number;
      insertedInvoices: number;
      skippedInvoices: number;
    };
    try {
      summary = await withTransaction(async (client) => {
        // 1. 기존 items → 정규화 키 맵
        const existing = await client.query("SELECT id, name FROM items");
        const itemByNormalized = new Map<string, number>();
        for (const row of existing.rows) {
          itemByNormalized.set(normalizeProductName(row.name), row.id);
        }

        // 2. 새 품목 식별 (전체 송장 순회)
        const newItems = new Set<string>();
        for (const p of pairs) {
          const raw =
            p.invoice.productNameRaw || p.order?.productNameRaw || "";
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
            `INSERT INTO items (name, barcode, image_data, image_mime, created_by, is_auto_created)
             VALUES ($1, NULL, NULL, NULL, $2, TRUE)
             RETURNING id`,
            [norm, userId]
          );
          itemByNormalized.set(norm, r.rows[0].id);
          insertedItems++;
        }

        // 4. invoices + invoice_items INSERT (송장 모두 등록, onlyInOrder는 등록 X)
        let insertedInvoices = 0;
        let skippedInvoices = 0;

        for (const p of pairs) {
          const raw =
            p.invoice.productNameRaw || p.order?.productNameRaw || "";
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
               raw_product_name, sender_name, customer_type, created_by
             )
             VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (invoice_no) DO NOTHING
             RETURNING id`,
            [
              p.invoice.invoiceNo,
              p.invoice.recipientName || p.order?.recipientName || null,
              p.invoice.recipientPhone || p.order?.recipientPhone || null,
              p.invoice.recipientAddress || p.order?.address || null,
              p.order?.postalCode || null,
              deliveryNote,
              p.invoice.orderNo || p.order?.orderNo || null,
              raw || null,
              p.invoice.senderName || null,
              p.order?.customerType ?? null,
              userId,
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

        return { insertedItems, insertedInvoices, skippedInvoices };
      });
    } catch (e) {
      console.error("트랜잭션 실패:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error:
            "데이터 저장 중 오류가 발생해 모든 변경사항을 되돌렸습니다. (" +
            msg +
            ")",
        },
        { status: 500 }
      );
    }

    await logAccess({
      session,
      action: "invoice.bulk_create",
      targetType: "invoice",
      request,
    });

    return NextResponse.json({
      summary,
      message: "송장 등록이 완료되었습니다.",
    });
  } catch (error) {
    console.error("송장 확정 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
