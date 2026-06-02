import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/admin/users/[id]/active
// body: { is_active: boolean }
// 본인 활성화 변경 불가.
export async function POST(request: Request, { params }: RouteContext) {
  const r = await requireAdmin();
  if (!r.ok) return r.response;

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) {
    return NextResponse.json(
      { error: "잘못된 사용자 ID입니다." },
      { status: 400 }
    );
  }
  if (targetId === r.userId) {
    return NextResponse.json(
      { error: "본인 계정은 비활성화할 수 없습니다." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.is_active !== "boolean") {
    return NextResponse.json(
      { error: "is_active는 boolean이어야 합니다." },
      { status: 400 }
    );
  }
  const isActive: boolean = body.is_active;

  const upd = await query(
    `UPDATE users SET is_active = $1 WHERE id = $2
     RETURNING id, username, is_active`,
    [isActive, targetId]
  );
  if (upd.rows.length === 0) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  await logAccess({
    session: r.session,
    action: isActive ? "admin.user_activated" : "admin.user_deactivated",
    targetType: "user",
    targetId,
    request,
  });

  return NextResponse.json({ user: upd.rows[0] });
}
