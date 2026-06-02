import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { logAccess } from "@/lib/audit";

// GET /api/admin/users — 사용자 목록 (관리자)
export async function GET() {
  const r = await requireAdmin();
  if (!r.ok) return r.response;

  const result = await query(
    `SELECT u.id, u.username, u.nickname, u.role, u.is_active,
            u.must_change_password, u.created_at, u.created_by,
            c.nickname AS created_by_name
       FROM users u
       LEFT JOIN users c ON u.created_by = c.id
      ORDER BY u.created_at DESC, u.id DESC`
  );
  return NextResponse.json({ users: result.rows });
}

// POST /api/admin/users — 사용자 추가 (관리자)
// body: { username, nickname, role }
// 응답: 임시 비번 평문 1회 포함 (이후 다시 못 봄)
export async function POST(request: Request) {
  const r = await requireAdmin();
  if (!r.ok) return r.response;

  const body = await request.json().catch(() => ({}));
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const nickname =
    typeof body?.nickname === "string" ? body.nickname.trim() : "";
  const role = body?.role === "admin" ? "admin" : "user";

  if (!username || !nickname) {
    return NextResponse.json(
      { error: "아이디와 이름은 필수입니다." },
      { status: 400 }
    );
  }
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
    return NextResponse.json(
      { error: "아이디는 영문/숫자/_ 3~30자여야 합니다." },
      { status: 400 }
    );
  }
  if (nickname.length > 50) {
    return NextResponse.json(
      { error: "이름은 50자 이내여야 합니다." },
      { status: 400 }
    );
  }

  // 중복 체크
  const dup = await query(`SELECT 1 FROM users WHERE username = $1`, [username]);
  if (dup.rows.length > 0) {
    return NextResponse.json(
      { error: "이미 사용 중인 아이디입니다." },
      { status: 409 }
    );
  }

  const tempPassword = generateTempPassword();
  const hashed = await hashPassword(tempPassword);

  const ins = await query(
    `INSERT INTO users
       (username, password, nickname, role, must_change_password, created_by)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     RETURNING id, username, nickname, role, is_active,
               must_change_password, created_at`,
    [username, hashed, nickname, role, r.userId]
  );

  await logAccess({
    session: r.session,
    action: "admin.user_created",
    targetType: "user",
    targetId: ins.rows[0].id,
    request,
  });

  return NextResponse.json({
    user: ins.rows[0],
    // 평문 임시 비번 — 응답에 1회만 포함
    temp_password: tempPassword,
  });
}
