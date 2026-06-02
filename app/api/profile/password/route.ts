import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "@/lib/password";
import { logAccess } from "@/lib/audit";

// POST /api/profile/password
// body: { current_password, new_password }
// 성공 시 must_change_password=false 로 갱신.
export async function POST(request: Request) {
  const r = await requireUser();
  if (!r.ok) return r.response;

  const body = await request.json().catch(() => ({}));
  const current =
    typeof body?.current_password === "string" ? body.current_password : "";
  const next =
    typeof body?.new_password === "string" ? body.new_password : "";

  if (!current || !next) {
    return NextResponse.json(
      { error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." },
      { status: 400 }
    );
  }

  const v = validateNewPassword(next);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  // 현재 비번 검증
  const userRes = await query(`SELECT password FROM users WHERE id = $1`, [
    r.userId,
  ]);
  if (userRes.rows.length === 0) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다." },
      { status: 404 }
    );
  }
  const ok = await verifyPassword(current, userRes.rows[0].password);
  if (!ok) {
    return NextResponse.json(
      { error: "현재 비밀번호가 일치하지 않습니다." },
      { status: 400 }
    );
  }

  // 새 비번이 현재와 같은지 차단
  const same = await verifyPassword(next, userRes.rows[0].password);
  if (same) {
    return NextResponse.json(
      { error: "새 비밀번호는 현재 비밀번호와 달라야 합니다." },
      { status: 400 }
    );
  }

  const hashed = await hashPassword(next);
  await query(
    `UPDATE users
        SET password = $1,
            must_change_password = FALSE
      WHERE id = $2`,
    [hashed, r.userId]
  );

  await logAccess({
    session: r.session,
    action: "user.password_changed",
    targetType: "user",
    targetId: r.userId,
    request,
  });

  return NextResponse.json({ ok: true });
}
