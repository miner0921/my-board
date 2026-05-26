import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 품목 이미지 바이트 응답 (로그인 필수)
// items.image_data(BYTEA) 를 image_mime의 Content-Type으로 직접 서빙
export async function GET(_request: Request, { params }: RouteContext) {
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
      `SELECT image_data, image_mime, updated_at
       FROM items
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
    const buffer: Buffer = image_data;
    const mime: string = image_mime ?? "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.byteLength),
        // 수정 시 updated_at 갱신 → ETag 변경 → 자동 캐시 무효화
        ETag: `"${id}-${new Date(updated_at).getTime()}"`,
        // 로그인 보호된 리소스라 private
        "Cache-Control": "private, max-age=3600, must-revalidate",
      },
    });
  } catch (error) {
    console.error("품목 이미지 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
