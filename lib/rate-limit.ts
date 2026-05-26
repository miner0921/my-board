import { query } from "@/lib/db";

// 정책: 같은 username 또는 같은 IP가 최근 1분 5회 실패 → 10분 차단.
// 차단 만료는 "가장 마지막 실패로부터 BLOCK_MINUTES 경과" 기준.
const WINDOW_MINUTES = 1;
const MAX_FAILURES = 5;
const BLOCK_MINUTES = 10;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export async function checkLoginRateLimit(
  username: string | null,
  ip: string | null
): Promise<RateLimitResult> {
  if (!username && !ip) return { allowed: true };

  const result = await query(
    `SELECT MAX(attempted_at) AS last_failed, COUNT(*)::int AS fail_count
     FROM login_attempts
     WHERE success = false
       AND attempted_at > NOW() - ($1 || ' minutes')::interval
       AND (username = $2 OR ip_address = $3::inet)`,
    [String(WINDOW_MINUTES), username, ip]
  );

  const row = result.rows[0];
  const failCount: number = row?.fail_count ?? 0;
  if (failCount < MAX_FAILURES) return { allowed: true };

  const lastFailed: Date | null = row?.last_failed
    ? new Date(row.last_failed)
    : null;
  if (!lastFailed) return { allowed: true };

  const unblockAt = new Date(lastFailed.getTime() + BLOCK_MINUTES * 60 * 1000);
  const now = new Date();
  if (now >= unblockAt) return { allowed: true };

  const retryAfterSec = Math.ceil((unblockAt.getTime() - now.getTime()) / 1000);
  return { allowed: false, retryAfterSec };
}

export async function recordLoginAttempt(params: {
  username: string | null;
  ip: string | null;
  success: boolean;
}) {
  try {
    await query(
      `INSERT INTO login_attempts (username, ip_address, success)
       VALUES ($1, $2::inet, $3)`,
      [params.username, params.ip, params.success]
    );
  } catch (e) {
    console.error("로그인 시도 기록 실패:", e);
  }
}
