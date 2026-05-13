import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

// 동적 라우트의 params는 Promise로 받음 (Next.js 15 변경사항)
type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 게시글 1개 조회
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const result = await query(
      `SELECT
         p.id, p.title, p.barcode, p.content, p.created_at, p.updated_at, p.user_id,
         u.nickname AS author_nickname
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "게시글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ post: result.rows[0] });
  } catch (error) {
    console.error("게시글 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PUT: 게시글 수정 (본인만)
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
    const { title, content, barcode } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "품목명과 내용을 모두 입력해주세요." },
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

    // 본인 글인지 확인
    const check = await query(
      "SELECT user_id FROM posts WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "게시글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (String(check.rows[0].user_id) !== session.user.id) {
      return NextResponse.json(
        { error: "수정 권한이 없습니다." },
        { status: 403 }
      );
    }

    // 수정 진행
    const result = await query(
      `UPDATE posts
       SET title = $1, content = $2, barcode = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, title, content, barcode, updated_at`,
      [title, content, barcodeValue, id]
    );

    return NextResponse.json({ post: result.rows[0], message: "수정 완료!" });
  } catch (error) {
    console.error("게시글 수정 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 게시글 삭제 (본인만)
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 본인 글인지 확인
    const check = await query(
      "SELECT user_id FROM posts WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "게시글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (String(check.rows[0].user_id) !== session.user.id) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다." },
        { status: 403 }
      );
    }

    // 삭제 (댓글은 ON DELETE CASCADE로 자동 삭제됨)
    await query("DELETE FROM posts WHERE id = $1", [id]);

    return NextResponse.json({ message: "삭제 완료!" });
  } catch (error) {
    console.error("게시글 삭제 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}