import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string; aliasId: string }>;
};

// DELETE: 품목 별칭 삭제 (관리자만).
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const authz = await requireAdmin();
    if (!authz.ok) return authz.response;

    const { id, aliasId } = await params;

    const res = await query(
      "DELETE FROM item_aliases WHERE id = $1 AND item_id = $2 RETURNING id",
      [Number(aliasId), Number(id)]
    );
    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: "별칭을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await logAccess({
      session: authz.session,
      action: "item.alias_delete",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({ message: "별칭이 삭제되었습니다." });
  } catch (error) {
    console.error("별칭 삭제 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
