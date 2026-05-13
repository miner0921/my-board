@AGENTS.md
# 게시판 프로젝트

## 기술 스택
- Next.js 15 (App Router)
- PostgreSQL 18 (로컬, DB명: boarddb)
- NextAuth.js v5
- Tailwind CSS v4
- TypeScript
- bcryptjs (비밀번호 해시)
- pg (PostgreSQL 클라이언트)

## 폴더 구조
- app/ - 페이지와 API 라우트
  - app/api/ - API endpoints
  - app/posts/[id]/ - 게시글 상세 (Comments, DeleteButton, edit 포함)
- lib/db.ts - DB 연결 (pool, query 함수)
- auth.ts - NextAuth 메인 설정
- auth.config.ts - Edge 환경용 NextAuth 설정
- proxy.ts - 라우트 보호

## DB 테이블
- users (id, username, password, nickname, created_at)
- posts (id, title, content, user_id, created_at, updated_at)
- comments (id, post_id, user_id, content, created_at)

## 코딩 규칙
- 모든 응답은 한국어로
- 주석은 한국어로
- 변수/함수명은 영어
- Server Component를 기본으로, 인터랙션 필요할 때만 "use client"
- API는 NextResponse.json() 사용
- 권한 체크는 미들웨어 + 페이지 + API 삼중

## 주의사항
- params는 Promise (Next.js 15)
- session.user.id는 string, DB의 user_id는 number → 비교 시 String() 사용
- 비밀번호는 항상 bcrypt.hash로 해시 후 저장