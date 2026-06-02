import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";

// API 라우트에서 자주 쓰는 권한 체크 헬퍼.
// 각 함수는 통과 시 { ok: true, session, userId }, 실패 시 NextResponse 반환.

export type AuthOk = {
  ok: true;
  session: Session;
  userId: number;
  role: "user" | "admin";
};

export type AuthFail = {
  ok: false;
  response: NextResponse;
};

// 로그인 필수. 미인증이면 401.
export async function requireUser(): Promise<AuthOk | AuthFail> {
  const session = (await auth()) as Session | null;
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      ),
    };
  }
  const role = ((session.user as { role?: string }).role ?? "user") as
    | "user"
    | "admin";
  return {
    ok: true,
    session,
    userId: Number(session.user.id),
    role,
  };
}

// 관리자 권한 필수. 미인증 401, 일반 사용자 403.
export async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const r = await requireUser();
  if (!r.ok) return r;
  if (r.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      ),
    };
  }
  return r;
}
