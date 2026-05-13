import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

type RouteContext = {
  params: Promise<{ id: string; commentId: string }>;
};

// DELETE: 댓글 삭제 (본인만)
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { commentId } = await params;

    // 댓글 존재 + 본인 댓글인지 확인
    const check = await query(
      "SELECT user_id FROM comments WHERE id = $1",
      [commentId]
    );

    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "댓글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (String(check.rows[0].user_id) !== session.user.id) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다." },
        { status: 403 }
      );
    }

    await query("DELETE FROM comments WHERE id = $1", [commentId]);

    return NextResponse.json({ message: "삭제 완료!" });
  } catch (error) {
    console.error("댓글 삭제 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}