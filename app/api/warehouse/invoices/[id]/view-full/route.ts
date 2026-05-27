import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST: 송장 수령인 정보 마스킹 해제 조회.
// 평문(recipient_name/phone/address/postal_code)을 반환하기 전에
// 감사 로그를 남긴다. GET이 아니라 POST인 이유:
//   - 부수효과(감사 로그)가 있는 요청
//   - 브라우저/프록시가 캐시·프리페치하지 못하도록
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

    const result = await query(
      `SELECT recipient_name, recipient_phone,
              recipient_address, recipient_postal_code
         FROM invoices
        WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session,
      action: "invoice.view_unmasked",
      targetType: "invoice",
      targetId: id,
      request,
    });

    return NextResponse.json({ recipient: result.rows[0] });
  } catch (error) {
    console.error("송장 평문 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
