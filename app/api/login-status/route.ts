import { NextResponse } from "next/server";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/audit";

// 로그인 폼이 signIn 실패 후 호출 → 현재 차단 상태와 남은 시간(초)을 반환.
// 정확한 정책(5회/1분)은 응답에서 노출하지 않고 retryAfterSec 만 제공.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username =
      typeof body?.username === "string" && body.username.length > 0
        ? body.username
        : null;
    const ip = extractClientIp(request);

    const result = await checkLoginRateLimit(username, ip);
    if (result.allowed) {
      return NextResponse.json({ blocked: false });
    }
    return NextResponse.json({
      blocked: true,
      retryAfterSec: result.retryAfterSec,
    });
  } catch (error) {
    console.error("로그인 상태 조회 에러:", error);
    // 조회 실패 시 폼은 일반 에러 메시지로 폴백
    return NextResponse.json({ blocked: false });
  }
}
