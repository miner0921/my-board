import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 특정 글의 댓글 목록 조회
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const result = await query(
      `SELECT 
         c.id, c.content, c.created_at, c.user_id,
         u.nickname AS author_nickname
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    return NextResponse.json({ comments: result.rows });
  } catch (error) {
    console.error("댓글 목록 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 댓글 작성 (로그인 필수)
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { content } = await request.json();

    if (!content || content.trim() === "") {
      return NextResponse.json(
        { error: "댓글 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    // 게시글 존재 확인
    const postCheck = await query("SELECT id FROM posts WHERE id = $1", [id]);
    if (postCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "게시글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 댓글 저장 + 작성자 닉네임 함께 반환
    const result = await query(
      `WITH inserted AS (
         INSERT INTO comments (post_id, user_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, post_id, user_id, content, created_at
       )
       SELECT i.*, u.nickname AS author_nickname
       FROM inserted i
       JOIN users u ON i.user_id = u.id`,
      [id, session.user.id, content.trim()]
    );

    return NextResponse.json(
      { comment: result.rows[0], message: "댓글 작성 성공!" },
      { status: 201 }
    );
  } catch (error) {
    console.error("댓글 작성 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}