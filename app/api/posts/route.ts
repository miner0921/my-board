import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { readUploadedImage } from "@/lib/upload";

// GET: 게시글 목록 조회
// image_data(BYTEA)는 절대 같이 SELECT하지 않음. 존재 여부만 has_image로 표시
export async function GET() {
  try {
    const result = await query(
      `SELECT
         p.id,
         p.title,
         p.barcode,
         p.content,
         p.created_at,
         p.user_id,
         (p.image_data IS NOT NULL) AS has_image,
         u.nickname AS author_nickname,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );

    return NextResponse.json({ posts: result.rows });
  } catch (error) {
    console.error("게시글 목록 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 새 게시글 작성 (로그인 필수)
// multipart/form-data 로 받음: title, content, barcode, image(선택)
export async function POST(request: Request) {
  try {
    // 1. 로그인 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    // 2. FormData 파싱
    const formData = await request.formData();
    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const barcodeRaw = String(formData.get("barcode") ?? "").trim();
    const image = formData.get("image");

    if (!title || !content) {
      return NextResponse.json(
        { error: "품목명과 내용을 모두 입력해주세요." },
        { status: 400 }
      );
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: "품목명은 200자 이하여야 합니다." },
        { status: 400 }
      );
    }

    const barcodeValue: string | null = barcodeRaw !== "" ? barcodeRaw : null;
    if (barcodeValue !== null && barcodeValue.length > 50) {
      return NextResponse.json(
        { error: "바코드는 50자 이하여야 합니다." },
        { status: 400 }
      );
    }

    // 3. 이미지 검증 (선택)
    let imageBuffer: Buffer | null = null;
    let imageMime: string | null = null;
    if (image instanceof File && image.size > 0) {
      const result = await readUploadedImage(image);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      imageBuffer = result.buffer;
      imageMime = result.mime;
    }

    // 4. DB에 저장 (image_data는 BYTEA, pg가 Buffer를 자동으로 바인딩)
    const result = await query(
      `INSERT INTO posts (title, content, barcode, image_data, image_mime, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, content, barcode, user_id, created_at,
                 (image_data IS NOT NULL) AS has_image`,
      [title, content, barcodeValue, imageBuffer, imageMime, session.user.id]
    );

    return NextResponse.json(
      { post: result.rows[0], message: "게시글 작성 성공!" },
      { status: 201 }
    );
  } catch (error) {
    console.error("게시글 작성 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
