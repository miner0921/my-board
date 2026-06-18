import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { readUploadedImage } from "@/lib/upload";
import { logAccess } from "@/lib/audit";
import {
  composeProductName,
  MAX_PRODUCT_CODE_LEN,
  MAX_CATEGORY_LEN,
  MAX_KIND_LEN,
  MAX_NAME_LEN,
  MAX_BARCODE_LEN,
} from "@/lib/product-name";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 단일 품목 조회 (로그인 필수)
// 수정 페이지 초기값 로딩용. image_data는 SELECT 하지 않음.
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;

    const result = await query(
      `SELECT
         i.id, i.product_code, i.category, i.kind, i.barcode, i.name,
         i.created_by, i.created_at, i.updated_at,
         i.is_auto_created, i.scan_exempt,
         (i.image_data IS NOT NULL) AS has_image,
         u.nickname AS author_nickname
       FROM items i
       LEFT JOIN users u ON i.created_by = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session,
      action: "item.read",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    console.error("품목 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PUT: 품목 수정 (본인만)
// product_code/category/kind/barcode 수정. name(품명)은 composeProductName(구분, 종류)로 조합.
// name/category/kind 는 항상 같이 기록(드리프트 방지) — name 만 따로 바꾸는 경로 없음.
// barcode 빈 문자열은 NULL 로 저장.
// image 새 파일이면 교체, removeImage="1"이면 NULL, 둘 다 아니면 기존 유지.
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const formData = await request.formData();
    const productCodeRaw = String(formData.get("product_code") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const kind = String(formData.get("kind") ?? "").trim();
    const barcodeRaw = String(formData.get("barcode") ?? "").trim();
    const image = formData.get("image");
    const removeImage = formData.get("removeImage") === "1";
    const scanExempt = formData.get("scan_exempt") === "1";

    const name = composeProductName(category, kind);

    if (!kind) {
      return NextResponse.json(
        { error: "종류(품명)를 입력해주세요." },
        { status: 400 }
      );
    }
    if (productCodeRaw.length > MAX_PRODUCT_CODE_LEN) {
      return NextResponse.json(
        { error: "품목코드는 100자 이하여야 합니다." },
        { status: 400 }
      );
    }
    if (category.length > MAX_CATEGORY_LEN) {
      return NextResponse.json(
        { error: "구분은 100자 이하여야 합니다." },
        { status: 400 }
      );
    }
    if (kind.length > MAX_KIND_LEN) {
      return NextResponse.json(
        { error: "종류는 200자 이하여야 합니다." },
        { status: 400 }
      );
    }
    if (barcodeRaw.length > MAX_BARCODE_LEN) {
      return NextResponse.json(
        { error: "바코드는 100자 이하여야 합니다." },
        { status: 400 }
      );
    }
    if (name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: "구분+종류로 조합한 품명이 200자를 초과합니다." },
        { status: 400 }
      );
    }

    const productCode: string | null = productCodeRaw === "" ? null : productCodeRaw;
    const barcode: string | null = barcodeRaw === "" ? null : barcodeRaw;

    // 권한 체크: 자동 등록(is_auto_created=TRUE)이면 누구나 수정 가능,
    // 직접 등록 품목은 본인만 수정 가능
    const check = await query(
      "SELECT created_by, is_auto_created FROM items WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    const isAutoCreated = check.rows[0].is_auto_created === true;
    const isOwner = String(check.rows[0].created_by) === session.user.id;
    if (!isAutoCreated && !isOwner) {
      return NextResponse.json(
        { error: "수정 권한이 없습니다." },
        { status: 403 }
      );
    }

    let imageSql: string;
    let imageParams: unknown[];

    if (image instanceof File && image.size > 0) {
      const parsed = await readUploadedImage(image);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      imageSql = ", image_data = $8, image_mime = $9";
      imageParams = [parsed.buffer, parsed.mime];
    } else if (removeImage) {
      imageSql = ", image_data = NULL, image_mime = NULL";
      imageParams = [];
    } else {
      imageSql = "";
      imageParams = [];
    }

    // 바코드는 중복 허용 (016에서 UNIQUE 제약 해제).
    const result = await query(
      `UPDATE items
       SET product_code = $1, category = $2, kind = $3, barcode = $4, name = $5,
           scan_exempt = $6, updated_at = CURRENT_TIMESTAMP
           ${imageSql}
       WHERE id = $7
       RETURNING id, product_code, category, kind, barcode, name, updated_at, scan_exempt,
                 (image_data IS NOT NULL) AS has_image`,
      [productCode, category, kind, barcode, name, scanExempt, id, ...imageParams]
    );

    await logAccess({
      session,
      action: "item.update",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({ item: result.rows[0], message: "수정 완료!" });
  } catch (error) {
    console.error("품목 수정 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// 품목 "삭제"는 숨김(soft delete)으로 전환됨 → POST /api/warehouse/items/hide
// (완전삭제 라우트 제거: 검수기록·송장 참조 보존)
