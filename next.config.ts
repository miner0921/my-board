import type { NextConfig } from "next";

// Phase 2.5 보안 헤더 (모든 경로에 적용)
// Permissions-Policy 는 전 경로 동일하게 적용한다 — camera 는 같은 출처(self)만 허용,
// mic·geo 는 전면 차단. (과거엔 /warehouse/scan 만 camera=(self), 그 외 camera=() 로
// 경로 분기했으나, 대시보드 등 다른 경로로 먼저 로드된 뒤 SPA 내비게이션으로 스캔에
// 진입하면 최초 문서의 camera=() 정책이 유지되어 카메라가 정책 레벨에서 차단됐다.
// 문서를 새로 받지 않는 클라이언트 전환에서도 카메라가 열리도록 전 경로 self 로 통일.)
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

// 권한 정책: 쓰지 않는 장치/센서는 차단. camera 는 같은 출처(self)만 허용(전 경로 동일),
// mic·geo 는 항상 전면 차단. self 는 우리 오리진만 허용하고 제3자(*)는 여전히 불허.
const PERMISSIONS_POLICY = "camera=(self), microphone=(), geolocation=()";

const nextConfig: NextConfig = {
  // Cloud Run 배포용: standalone 빌드로 최소 실행 이미지 생성
  output: "standalone",
  async headers() {
    return [
      {
        // 전 경로 동일 적용 — 어떤 문서로 진입하든 카메라 정책이 self 라 SPA 전환에서도 열림.
        source: "/(.*)",
        headers: [
          ...commonSecurityHeaders,
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
