import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";
import { MAX_BARCODE_LEN } from "@/lib/product-name";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST: 품목 추가 바코드 등록.
// 권한: 로그인 사용자(작업자 포함) — 현행 바코드 수정 정책과 동일(별칭과 다름).
//
// 검증(하드 블록):
//   - 빈값 거부 / 100자 초과 거부
//   - 같은 품목의 대표 바코드(items.barcode)와 동일하면 거부(중복 무의미)
//   - 같은 품목 내 추가 바코드 중복 거부 (UNIQUE(item_id, barcode)가 최종 방어)
//   - ★ 다른 품목과의 바코드 중복은 허용 (016 · 실서버 (샘플)↔(1팩) 등 의도된 공유)
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authz = await requireUser();
    if (!authz.ok) return authz.response;

    const { id } = await params;
    const itemId = Number(id);

    const body = await request.json().catch(() => ({}));
    const barcode = String(body?.barcode ?? "").trim();

    // 1) 빈값
    if (barcode === "") {
      return NextResponse.json({ error: "바코드가 비어있습니다." }, { status: 400 });
    }
    // 2) 길이
    if (barcode.length > MAX_BARCODE_LEN) {
      return NextResponse.json(
        { error: "바코드는 100자 이하여야 합니다." },
        { status: 400 }
      );
    }

    // 대상 품목 확인 (활성) + 대표 바코드
    const itemRes = await query(
      "SELECT id, barcode FROM items WHERE id = $1 AND deleted_at IS NULL",
      [itemId]
    );
    if (itemRes.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 3) 같은 품목의 대표 바코드와 동일 → 별도 등록 불필요
    if (itemRes.rows[0].barcode === barcode) {
      return NextResponse.json(
        { error: "이 품목의 대표 바코드와 같습니다. 추가로 등록할 필요가 없습니다." },
        { status: 400 }
      );
    }

    // 4) 같은 품목 내 중복 (UNIQUE 전에 친절한 메시지로 먼저 차단)
    const dup = await query(
      "SELECT id FROM item_barcodes WHERE item_id = $1 AND barcode = $2 LIMIT 1",
      [itemId, barcode]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json(
        { error: "이미 이 품목에 등록된 바코드입니다." },
        { status: 400 }
      );
    }

    let inserted;
    try {
      const res = await query(
        `INSERT INTO item_barcodes (item_id, barcode, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, barcode`,
        [itemId, barcode, authz.userId]
      );
      inserted = res.rows[0];
    } catch (e) {
      // UNIQUE(item_id, barcode) 경쟁 상황 방어
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("item_barcodes_item_id_barcode_key") || msg.includes("unique")) {
        return NextResponse.json(
          { error: "이미 이 품목에 등록된 바코드입니다." },
          { status: 400 }
        );
      }
      throw e;
    }

    await logAccess({
      session: authz.session,
      action: "item.barcode_create",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json(
      { barcode: inserted, message: "바코드가 추가되었습니다." },
      { status: 201 }
    );
  } catch (error) {
    console.error("추가 바코드 등록 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
