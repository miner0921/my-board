import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// GET: 업로드 파일 1건 다운로드 (로그인 필수). 파일 id 기준.
//   한 등록 단위에 발주서/송장이 여러 개일 때 개별 파일을 받기 위함.
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
    const fileId = Number(id);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      return NextResponse.json({ error: "잘못된 id 입니다." }, { status: 400 });
    }

    const result = await query(
      `SELECT file_data, filename, mime, kind
         FROM upload_files
        WHERE id = $1`,
      [fileId]
    );

    if (result.rows.length === 0 || !result.rows[0].file_data) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 404 });
    }

    const { file_data, filename, mime, kind } = result.rows[0];
    const buffer: Buffer = file_data;
    const contentType: string = mime || XLSX_MIME;
    const safeName = filename || `${kind ?? "file"}.xlsx`;
    const encodedName = encodeURIComponent(safeName);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("업로드 파일 다운로드 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
