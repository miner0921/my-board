# syntax=docker/dockerfile:1

# ── 1단계: 의존성 설치 ──────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
# lock 파일 기준으로 정확히 재현되는 설치
COPY package.json package-lock.json ./
RUN npm ci

# ── 2단계: 빌드 ────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js 텔레메트리 끔 (빌드 속도/로그 정리)
ENV NEXT_TELEMETRY_DISABLED=1
# warehouse 페이지는 auth()로 동적 렌더링되어 빌드 시 DB 접속 불필요
RUN npm run build

# ── 3단계: 실행 (최소 이미지) ───────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run은 PORT 환경변수로 포트를 주입함 (기본 8080)
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# 보안: 비루트 사용자로 실행
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone 산출물만 복사 (node_modules 통째로 안 넣어 이미지 경량화)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
# standalone 빌드는 server.js를 진입점으로 생성함
CMD ["node", "server.js"]
