import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 업로드 내역 한 건의 상세 (로그인 필수, 읽기 전용)
//   - 집계(등록 송장·새 품목·건너뜀) + 등록된 송장번호 목록 + 새 품목 이름 목록.
//   - BYTEA는 SELECT 안 함.
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const batchId = Number(id);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return NextResponse.json({ error: "잘못된 id 입니다." }, { status: 400 });
    }

    const batchRes = await query(
      `SELECT inserted_items, inserted_invoices, skipped_invoices,
              inserted_item_names
         FROM upload_batches
        WHERE id = $1`,
      [batchId]
    );
    if (batchRes.rows.length === 0) {
      return NextResponse.json(
        { error: "내역을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    const b = batchRes.rows[0];

    // 이 내역으로 등록된 송장번호 (upload_batch_id 링크)
    const invRes = await query(
      `SELECT invoice_no
         FROM invoices
        WHERE upload_batch_id = $1
        ORDER BY id`,
      [batchId]
    );

    return NextResponse.json({
      insertedItems: b.inserted_items,
      insertedInvoices: b.inserted_invoices,
      skippedInvoices: b.skipped_invoices,
      itemNames: (b.inserted_item_names ?? []) as string[],
      invoiceNos: invRes.rows.map((r) => r.invoice_no as string),
    });
  } catch (error) {
    console.error("업로드 내역 상세 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
