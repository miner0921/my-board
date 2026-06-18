import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { readUploadedSpreadsheet } from "@/lib/upload";
import { parseItemsSheet } from "@/lib/parse-excel";
import { classifyBulkItems } from "@/lib/bulk-items";

// POST: 품목 대량 등록 파일(.xlsx/.csv) 분석만 (저장 X).
// 실제 저장은 /api/warehouse/items/bulk 에서 같은 파일을 다시 받아 처리.
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "엑셀(.xlsx) 또는 CSV 파일을 업로드해주세요." },
        { status: 400 }
      );
    }

    const read = await readUploadedSpreadsheet(file);
    if (!read.ok) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }

    let rows;
    try {
      rows = parseItemsSheet(read.buffer);
    } catch (e) {
      console.error("품목 엑셀 파싱 실패:", e);
      return NextResponse.json(
        { error: "파일을 읽을 수 없습니다. 형식(품목코드/바코드/구분/종류 헤더)을 확인해주세요." },
        { status: 400 }
      );
    }

    // 기존 품목 품목코드 집합
    const existing = await query(
      "SELECT product_code FROM items WHERE deleted_at IS NULL AND product_code IS NOT NULL"
    );
    const knownCodes = new Set<string>(
      existing.rows.map((r) => r.product_code as string)
    );

    const { rows: classified, counts } = classifyBulkItems(rows, knownCodes);

    return NextResponse.json({
      counts,
      total: rows.length,
      // 미리보기 표시용 — 행 수가 많을 수 있어 최대 200행만 전송
      rows: classified.slice(0, 200).map((r) => ({
        rowNo: r.rowNo,
        productCode: r.productCode,
        category: r.category,
        kind: r.kind,
        name: r.name,
        barcode: r.barcode,
        action: r.action,
        reason: r.reason ?? null,
      })),
      truncated: classified.length > 200,
    });
  } catch (error) {
    console.error("품목 대량 등록 미리보기 에러:", error);
    return NextResponse.json(
      { error: "분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
