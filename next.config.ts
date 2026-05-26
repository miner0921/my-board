import type { NextConfig } from "next";

// Phase 2.5 보안 헤더 (모든 경로에 적용)
const securityHeaders = [
  // 다른 사이트가 iframe 으로 우리 페이지를 못 띄우게 함 (클릭재킹 방어)
  { key: "X-Frame-Options", value: "DENY" },
  // MIME sniffing 방어
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referer 전송 정책 (다른 출처로 갈 때는 origin 까지만)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 권한 정책: 쓰지 않는 장치/센서는 모두 차단
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // HSTS: HTTPS 강제 (HTTPS 응답에서만 효력. 로컬 http://에서는 브라우저가 무시)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
