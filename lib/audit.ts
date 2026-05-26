import { query } from "@/lib/db";

type Session = { user?: { id?: string } } | null | undefined;

// 프록시/Vercel 헤더에서 클라이언트 IP를 우선 추출
export function extractClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

// 감사 로그 기록.
// 실패해도 본 작업은 막지 않도록 try/catch 로 격리.
// 이미지 라우트 등 노이즈 많은 곳에서는 호출하지 않습니다.
export async function logAccess(params: {
  session: Session;
  action: string;
  targetType?: string;
  targetId?: number | string | null;
  request?: Request;
}) {
  try {
    const userId = params.session?.user?.id
      ? Number(params.session.user.id)
      : null;
    const ip = params.request ? extractClientIp(params.request) : null;
    const targetId =
      params.targetId === undefined ||
      params.targetId === null ||
      params.targetId === ""
        ? null
        : Number(params.targetId);

    await query(
      `INSERT INTO access_logs (user_id, action, target_type, target_id, ip_address)
       VALUES ($1, $2, $3, $4, $5::inet)`,
      [userId, params.action, params.targetType ?? null, targetId, ip]
    );
  } catch (e) {
    console.error("감사 로그 기록 실패:", e);
  }
}
