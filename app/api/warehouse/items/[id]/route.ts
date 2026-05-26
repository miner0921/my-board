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
// image 새 파일이면 교체, removeImage="1"이면 NULL, 둘 다 아니면 기존 유지
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
    const barcode = String(formData.get("barcode") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const image = formData.get("image");
    const removeImage = formData.get("removeImage") === "1";

    if (!barcode || !name) {
      return NextResponse.json(
        { error: "바코드와 품목명을 모두 입력해주세요." },
        { status: 400 }
      );
    }
    if (barcode.length > 100) {
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

    // 본인 등록 품목인지 확인
    const check = await query(
      "SELECT created_by FROM items WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (String(check.rows[0].created_by) !== session.user.id) {
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
      imageSql = ", image_data = $4, image_mime = $5";
      imageParams = [parsed.buffer, parsed.mime];
    } else if (removeImage) {
      imageSql = ", image_data = NULL, image_mime = NULL";
      imageParams = [];
    } else {
      imageSql = "";
      imageParams = [];
    }

    try {
      const result = await query(
        `UPDATE items
         SET barcode = $1, name = $2,
             updated_at = CURRENT_TIMESTAMP
             ${imageSql}
         WHERE id = $3
         RETURNING id, barcode, name, updated_at,
                   (image_data IS NOT NULL) AS has_image`,
        [barcode, name, id, ...imageParams]
      );

      await logAccess({
        session,
        action: "item.update",
        targetType: "item",
        targetId: id,
        request,
      });

      return NextResponse.json({ item: result.rows[0], message: "수정 완료!" });
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "23505"
      ) {
        return NextResponse.json(
          { error: "이미 등록된 바코드입니다." },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("품목 수정 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 품목 삭제 (본인만)
// 송장(invoice_items)에서 참조 중이면 FK 위반으로 차단
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;

    const check = await query(
      "SELECT created_by FROM items WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (String(check.rows[0].created_by) !== session.user.id) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다." },
        { status: 403 }
      );
    }

    try {
      await query("DELETE FROM items WHERE id = $1", [id]);
    } catch (e: unknown) {
      // foreign_key_violation: 송장에 사용 중이면 차단
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "23503"
      ) {
        return NextResponse.json(
          { error: "이 품목은 송장에 사용 중이라 삭제할 수 없습니다." },
          { status: 409 }
        );
      }
      throw e;
    }

    await logAccess({
      session,
      action: "item.delete",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({ message: "삭제 완료!" });
  } catch (error) {
    console.error("품목 삭제 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
