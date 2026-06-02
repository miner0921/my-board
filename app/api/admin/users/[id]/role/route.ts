import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/admin/users/[id]/role
// body: { role: 'user' | 'admin' }
// 본인 권한 변경 불가.
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
      { error: "본인 권한은 변경할 수 없습니다." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const role = body?.role === "admin" ? "admin" : body?.role === "user" ? "user" : null;
  if (!role) {
    return NextResponse.json(
      { error: "role은 'user' 또는 'admin'이어야 합니다." },
      { status: 400 }
    );
  }

  const upd = await query(
    `UPDATE users SET role = $1 WHERE id = $2
     RETURNING id, username, role`,
    [role, targetId]
  );
  if (upd.rows.length === 0) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  await logAccess({
    session: r.session,
    action: "admin.user_role_changed",
    targetType: "user",
    targetId,
    request,
  });

  return NextResponse.json({ user: upd.rows[0] });
}
