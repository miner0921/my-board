import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 게시글의 이미지 바이트를 반환
// posts.image_data(BYTEA)를 image_mime의 Content-Type으로 직접 응답
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const result = await query(
      `SELECT image_data, image_mime, updated_at
       FROM posts
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].image_data) {
      return NextResponse.json(
        { error: "이미지가 없습니다." },
        { status: 404 }
      );
    }

    const { image_data, image_mime, updated_at } = result.rows[0];
    // pg는 BYTEA를 Node Buffer로 돌려줌
    const buffer: Buffer = image_data;
    const mime: string = image_mime ?? "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.byteLength),
        // 같은 글이라도 수정되면 updated_at이 바뀌어 ETag도 바뀜 → 자동으로 캐시 무효화
        ETag: `"${id}-${new Date(updated_at).getTime()}"`,
        // 1시간 캐시 + 재검증 (ETag로 검증)
        "Cache-Control": "public, max-age=3600, must-revalidate",
      },
    });
  } catch (error) {
    console.error("이미지 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
