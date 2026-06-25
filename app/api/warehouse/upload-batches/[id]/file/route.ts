import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// xlsx 기본 MIME (저장된 mime이 없을 때 fallback)
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// GET: 업로드 묶음에 보관된 원본 파일(발주서/송장) 다운로드 (로그인 필수)
// ?kind=order | invoice 로 어느 측을 받을지 지정.
// upload_batches의 BYTEA를 저장 mime으로 직접 서빙(items 이미지 라우트 패턴).
// waiting/committed 무관하게, 해당 측 파일이 있으면 받을 수 있다.
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

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    if (kind !== "order" && kind !== "invoice") {
      return NextResponse.json(
        { error: "kind는 order 또는 invoice 여야 합니다." },
        { status: 400 }
      );
    }

    // kind에 따라 컬럼 선택 (BYTEA는 다운로드라 여기서만 SELECT)
    const cols =
      kind === "order"
        ? "order_file_data AS data, order_filename AS filename, order_mime AS mime"
        : "invoice_file_data AS data, invoice_filename AS filename, invoice_mime AS mime";

    const result = await query(
      `SELECT ${cols} FROM upload_batches WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].data) {
      return NextResponse.json(
        { error: "파일이 없습니다." },
        { status: 404 }
      );
    }

    const { data, filename, mime } = result.rows[0];
    const buffer: Buffer = data;
    const contentType: string = mime || XLSX_MIME;

    // 한글 파일명 보존: RFC 5987 filename* (UTF-8). 없으면 기본 이름.
    const safeName = filename || `${kind}.xlsx`;
    const encodedName = encodeURIComponent(safeName);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        // 로그인 보호된 리소스라 private
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("업로드 묶음 파일 다운로드 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
