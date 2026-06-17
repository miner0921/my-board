import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

// GET: 최근 발주서/송장 업로드 이력 (업로드 모달에서 표시)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const result = await query(
      `SELECT iu.id, iu.order_filename, iu.invoice_filename,
              iu.inserted_items, iu.inserted_invoices, iu.skipped_invoices,
              iu.uploaded_at, u.nickname AS uploaded_by_name
         FROM invoice_uploads iu
         LEFT JOIN users u ON iu.uploaded_by = u.id
        ORDER BY iu.uploaded_at DESC, iu.id DESC
        LIMIT 20`
    );

    return NextResponse.json({ uploads: result.rows });
  } catch (error) {
    console.error("업로드 이력 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
