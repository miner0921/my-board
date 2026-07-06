import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string; barcodeId: string }>;
};

// DELETE: 품목 추가 바코드 삭제.
// 권한: 로그인 사용자(작업자 포함) — 등록과 동일.
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const authz = await requireUser();
    if (!authz.ok) return authz.response;

    const { id, barcodeId } = await params;

    const res = await query(
      "DELETE FROM item_barcodes WHERE id = $1 AND item_id = $2 RETURNING id",
      [Number(barcodeId), Number(id)]
    );
    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: "바코드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session: authz.session,
      action: "item.barcode_delete",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({ message: "바코드가 삭제되었습니다." });
  } catch (error) {
    console.error("추가 바코드 삭제 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
