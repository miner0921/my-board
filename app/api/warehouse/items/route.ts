import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { readUploadedImage } from "@/lib/upload";
import { logAccess } from "@/lib/audit";

// GET: 품목 목록 (로그인 필수)
// ?q= 가 있으면 name/barcode 부분일치 검색
// image_data(BYTEA)는 절대 SELECT 하지 않음. has_image 로 존재 여부만 표시.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    const baseSelect = `
      SELECT
        i.id, i.barcode, i.name, i.created_by, i.created_at, i.updated_at,
        (i.image_data IS NOT NULL) AS has_image,
        u.nickname AS author_nickname
      FROM items i
      LEFT JOIN users u ON i.created_by = u.id
    `;

    const result =
      q === ""
        ? await query(`${baseSelect} ORDER BY i.created_at DESC`)
        : await query(
            `${baseSelect}
             WHERE i.name ILIKE $1 OR i.barcode ILIKE $1
             ORDER BY i.created_at DESC`,
            [`%${q}%`]
          );

    await logAccess({
      session,
      action: "item.list",
      targetType: "item",
      request,
    });

    return NextResponse.json({ items: result.rows });
  } catch (error) {
    console.error("품목 목록 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 새 품목 등록 (로그인 필수)
// multipart/form-data: barcode, name, image(선택)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const barcode = String(formData.get("barcode") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const image = formData.get("image");

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

    let imageBuffer: Buffer | null = null;
    let imageMime: string | null = null;
    if (image instanceof File && image.size > 0) {
      const parsed = await readUploadedImage(image);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      imageBuffer = parsed.buffer;
      imageMime = parsed.mime;
    }

    try {
      const result = await query(
        `INSERT INTO items (barcode, name, image_data, image_mime, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, barcode, name, created_by, created_at,
                   (image_data IS NOT NULL) AS has_image`,
        [barcode, name, imageBuffer, imageMime, session.user.id]
      );

      await logAccess({
        session,
        action: "item.create",
        targetType: "item",
        targetId: result.rows[0].id,
        request,
      });

      return NextResponse.json(
        { item: result.rows[0], message: "품목 등록 성공!" },
        { status: 201 }
      );
    } catch (e: unknown) {
      // PostgreSQL unique_violation
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
    console.error("품목 등록 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
