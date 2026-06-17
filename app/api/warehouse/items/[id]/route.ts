import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { readUploadedImage } from "@/lib/upload";
import { logAccess } from "@/lib/audit";

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
         i.id, i.barcode, i.name, i.created_by, i.created_at, i.updated_at,
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
    const barcodeRaw = String(formData.get("barcode") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const image = formData.get("image");
    const removeImage = formData.get("removeImage") === "1";
    const scanExempt = formData.get("scan_exempt") === "1";

    if (!name) {
      return NextResponse.json(
        { error: "품목명을 입력해주세요." },
        { status: 400 }
      );
    }
    if (barcodeRaw.length > 100) {
      return NextResponse.json(
        { error: "바코드는 100자 이하여야 합니다." },
        { status: 400 }
      );
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: "품목명은 200자 이하여야 합니다." },
        { status: 400 }
      );
    }

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
      imageSql = ", image_data = $5, image_mime = $6";
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
       SET barcode = $1, name = $2, scan_exempt = $3,
           updated_at = CURRENT_TIMESTAMP
           ${imageSql}
       WHERE id = $4
       RETURNING id, barcode, name, updated_at, scan_exempt,
                 (image_data IS NOT NULL) AS has_image`,
      [barcode, name, scanExempt, id, ...imageParams]
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
