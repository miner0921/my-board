import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

// GET: 게시글 목록 조회
export async function GET() {
  try {
    // posts 테이블 + users 테이블을 JOIN해서 작성자 닉네임도 함께 가져옴
    const result = await query(
      `SELECT
         p.id,
         p.title,
         p.barcode,
         p.content,
         p.created_at,
         p.user_id,
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

    // 2. 입력값 받기
    const { title, content, barcode } = await request.json();

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

    // 바코드는 선택값. 빈 문자열은 NULL로 저장
    const barcodeValue: string | null =
      typeof barcode === "string" && barcode.trim() !== ""
        ? barcode.trim()
        : null;

    if (barcodeValue !== null && barcodeValue.length > 50) {
      return NextResponse.json(
        { error: "바코드는 50자 이하여야 합니다." },
        { status: 400 }
      );
    }

    // 3. DB에 저장
    const result = await query(
      `INSERT INTO posts (title, content, barcode, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, content, barcode, user_id, created_at`,
      [title, content, barcodeValue, session.user.id]
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