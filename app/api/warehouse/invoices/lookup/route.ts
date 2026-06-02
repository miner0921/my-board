import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";
import { maskName, maskPhone, maskAddress } from "@/lib/mask";

// POST /api/warehouse/invoices/lookup
// body: { invoice_no: string }
// 검수 시작 시 송장 바코드로 송장+품목을 조회한다.
// 평문 PII는 절대 반환하지 않고 마스킹된 값만 내려준다.
// (평문이 필요하면 별도의 /view-full 라우트로 감사 로그 남기고 조회)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const invoiceNoRaw = typeof body?.invoice_no === "string" ? body.invoice_no : "";
    const invoiceNo = invoiceNoRaw.trim();

    if (!invoiceNo) {
      return NextResponse.json(
        { error: "송장 바코드를 입력하세요." },
        { status: 400 }
      );
    }

    const [invResult, itemsResult] = await Promise.all([
      query(
        `SELECT
           i.id, i.invoice_no, i.order_no, i.status,
           i.recipient_name, i.recipient_phone, i.recipient_address,
           i.recipient_postal_code, i.delivery_note, i.sender_name,
           i.customer_type, i.created_at,
           COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
           COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
         FROM invoices i
         LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.invoice_no = $1
         GROUP BY i.id`,
        [invoiceNo]
      ),
      query(
        `SELECT
           ii.id AS invoice_item_id,
           ii.item_id, ii.quantity, ii.scanned_count, ii.display_name,
           it.name, it.barcode, it.updated_at,
           (it.image_data IS NOT NULL) AS has_image
         FROM invoice_items ii
         JOIN items it ON it.id = ii.item_id
         JOIN invoices i ON i.id = ii.invoice_id
         WHERE i.invoice_no = $1
         ORDER BY ii.id`,
        [invoiceNo]
      ),
    ]);

    if (invResult.rows.length === 0) {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const raw = invResult.rows[0];

    if (raw.status === "completed") {
      return NextResponse.json(
        { error: "이미 완료된 송장입니다." },
        { status: 409 }
      );
    }

    await logAccess({
      session,
      action: "invoice.scan_start",
      targetType: "invoice",
      targetId: raw.id,
      request,
    });

    return NextResponse.json({
      invoice: {
        id: raw.id,
        invoice_no: raw.invoice_no,
        order_no: raw.order_no,
        status: raw.status,
        sender_name: raw.sender_name,
        customer_type: raw.customer_type,
        delivery_note: raw.delivery_note,
        recipient_postal_code: raw.recipient_postal_code,
        // 서버에서 마스킹해서 내려보냄 — 평문은 wire를 타지 않음
        recipient_name_masked: maskName(raw.recipient_name),
        recipient_phone_masked: maskPhone(raw.recipient_phone),
        recipient_address_masked: maskAddress(raw.recipient_address),
        total_qty: raw.total_qty,
        scanned_qty: raw.scanned_qty,
      },
      items: itemsResult.rows,
    });
  } catch (error) {
    console.error("송장 조회(lookup) 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
