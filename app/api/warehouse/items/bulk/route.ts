import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withTransaction } from "@/lib/db";
import { readUploadedSpreadsheet } from "@/lib/upload";
import { parseItemsSheet } from "@/lib/parse-excel";
import { normalizeProductName } from "@/lib/normalize-product";
import { classifyBulkItems } from "@/lib/bulk-items";
import { isScanExemptName } from "@/lib/scan-exempt";
import { logAccess } from "@/lib/audit";

// POST: 품목 대량 등록 확정 저장.
// 미리보기 결과를 신뢰하지 않고 서버에서 같은 파일을 다시 파싱한다.
//
// 규칙(묶음 B):
//   - 판단 기준 = 정규화된 품목명 (바코드 아님)
//   - 같은 정규화명이 있으면 그 품목의 barcode만 덮어쓰기(update),
//     없으면 새로 등록(create, is_auto_created=FALSE = 직접 등록)
//   - 빈 품목명/길이 초과 행은 건너뜀(skip)
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
        { error: "파일을 읽을 수 없습니다. 형식(품목명/바코드 2열)을 확인해주세요." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 기존 품목: 정규화명 → id 맵 (덮어쓰기 대상 찾기)
      const existing = await client.query("SELECT id, name FROM items");
      const idByNormalized = new Map<string, number>();
      const known = new Set<string>();
      for (const r of existing.rows) {
        const norm = normalizeProductName(r.name);
        idByNormalized.set(norm, r.id);
        known.add(norm);
      }

      // 미리보기와 동일한 분류 로직으로 행별 action 결정
      const { rows: classified, counts } = classifyBulkItems(rows, known);

      let inserted = 0;
      let updated = 0;
      for (const row of classified) {
        if (row.action === "skip") continue;

        if (row.action === "create") {
          const ins = await client.query(
            `INSERT INTO items (barcode, name, created_by, is_auto_created, scan_exempt)
             VALUES ($1, $2, $3, FALSE, $4)
             RETURNING id`,
            [row.barcode, row.name, userId, isScanExemptName(row.name)]
          );
          idByNormalized.set(row.normalized, ins.rows[0].id);
          inserted++;
        } else {
          // update: 같은 정규화명 품목의 바코드만 덮어쓰기
          const id = idByNormalized.get(row.normalized);
          if (id === undefined) continue; // 이론상 없음 (방어)
          await client.query(
            `UPDATE items
                SET barcode = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2`,
            [row.barcode, id]
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
