import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withTransaction } from "@/lib/db";
import { readUploadedSpreadsheet } from "@/lib/upload";
import { parseItemsSheet } from "@/lib/parse-excel";
import { classifyBulkItems } from "@/lib/bulk-items";
import { isScanExemptName } from "@/lib/scan-exempt";
import { logAccess } from "@/lib/audit";

// POST: 품목 대량 등록 확정 저장.
// 미리보기 결과를 신뢰하지 않고 서버에서 같은 파일을 다시 파싱한다.
//
// 규칙:
//   - 판단 기준 = 품목코드(product_code)
//   - 같은 품목코드가 있으면 그 품목의 구분/종류/바코드/품명 갱신(update),
//     없으면 새로 등록(create, is_auto_created=FALSE = 직접 등록)
//   - 품목코드/종류 없는 행, 길이 초과 행은 건너뜀(skip)
//   - name/category/kind 는 항상 같이 기록(parse 단계에서 composeProductName 적용됨)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = Number(session.user.id);

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

    const result = await withTransaction(async (client) => {
      // 기존 품목: 품목코드 → id 맵 (덮어쓰기 대상 찾기)
      const existing = await client.query(
        "SELECT id, product_code FROM items WHERE deleted_at IS NULL AND product_code IS NOT NULL"
      );
      const idByCode = new Map<string, number>();
      const known = new Set<string>();
      for (const r of existing.rows) {
        idByCode.set(r.product_code, r.id);
        known.add(r.product_code);
      }

      // 미리보기와 동일한 분류 로직으로 행별 action 결정
      const { rows: classified, counts } = classifyBulkItems(rows, known);

      let inserted = 0;
      let updated = 0;
      for (const row of classified) {
        if (row.action === "skip" || !row.productCode) continue;

        if (row.action === "create") {
          const ins = await client.query(
            `INSERT INTO items
               (product_code, barcode, category, kind, name, created_by, is_auto_created, scan_exempt)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
             RETURNING id`,
            [
              row.productCode,
              row.barcode,
              row.category,
              row.kind,
              row.name,
              userId,
              isScanExemptName(row.name),
            ]
          );
          idByCode.set(row.productCode, ins.rows[0].id);
          inserted++;
        } else {
          // update: 같은 품목코드 품목의 구분/종류/바코드/품명 갱신
          // (name/category/kind 항상 같이 기록 — 드리프트 방지)
          const id = idByCode.get(row.productCode);
          if (id === undefined) continue; // 이론상 없음 (방어)
          await client.query(
            `UPDATE items
                SET barcode = $1, category = $2, kind = $3, name = $4,
                    scan_exempt = $5, updated_at = CURRENT_TIMESTAMP
              WHERE id = $6`,
            [
              row.barcode,
              row.category,
              row.kind,
              row.name,
              isScanExemptName(row.name),
              id,
            ]
          );
          updated++;
        }
      }

      return { inserted, updated, skipped: counts.skip };
    });

    await logAccess({
      session,
      action: "item.bulk_create",
      targetType: "item",
      request,
    });

    return NextResponse.json({
      result,
      message: "품목 대량 등록이 완료되었습니다.",
    });
  } catch (error) {
    console.error("품목 대량 등록 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
