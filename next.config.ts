import type { NextConfig } from "next";

// Phase 2.5 보안 헤더 (모든 경로에 적용)
// camera 외 나머지는 전 경로 동일. Permissions-Policy 의 camera 부분만 경로별로
// 분기한다 — 검수 스캔 페이지에서만 같은 출처(self) 카메라 허용, 그 외는 전면 차단.
const commonSecurityHeaders = [
  // 다른 사이트가 iframe 으로 우리 페이지를 못 띄우게 함 (클릭재킹 방어)
  { key: "X-Frame-Options", value: "DENY" },
  // MIME sniffing 방어
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referer 전송 정책 (다른 출처로 갈 때는 origin 까지만)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS: HTTPS 강제 (HTTPS 응답에서만 효력. 로컬 http://에서는 브라우저가 무시)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

// 권한 정책: 쓰지 않는 장치/센서는 차단. camera 만 경로별로 다름(mic·geo 는 항상 차단).
const PERMISSIONS_POLICY_BLOCKED = "camera=(), microphone=(), geolocation=()";
const PERMISSIONS_POLICY_SCAN = "camera=(self), microphone=(), geolocation=()";

const nextConfig: NextConfig = {
  // Cloud Run 배포용: standalone 빌드로 최소 실행 이미지 생성
  output: "standalone",
  async headers() {
    return [
      {
        // 검수 스캔 페이지에서만 같은 출처 카메라 허용. 일반 규칙보다 먼저 두고,
        // 아래 일반 규칙은 이 경로를 제외(negative lookahead)해 겹치지 않게 한다.
        source: "/warehouse/scan",
        headers: [
          ...commonSecurityHeaders,
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY_SCAN },
        ],
      },
      {
        // 그 외 모든 경로 — 카메라 전면 차단 유지. (/warehouse/scan 은 제외)
        source: "/((?!warehouse/scan).*)",
        headers: [
          ...commonSecurityHeaders,
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY_BLOCKED },
        ],
      },
    ];
  },
};

export default nextConfig;
