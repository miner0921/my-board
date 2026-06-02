-- =====================================================
-- 015. users 테이블에 role / is_active / must_change_password / created_by 추가
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- Phase 6 사용자 관리 + 관리자 권한 시스템.
--   - role: 'user' 또는 'admin'. 기본은 'user'.
--   - is_active: false면 로그인 차단 (authorize에서 거부).
--   - must_change_password: true면 로그인 직후 /profile/password로 강제.
--   - created_by: 누가 이 계정을 만들었나 (관리자가 추가한 경우).
--
-- 기존 사용자는 모두 'user' 권한, 활성 상태, 비번 변경 불요로 자동 설정.
-- 재실행 안전 (IF NOT EXISTS).
--
-- ----- 첫 관리자 지정 (이 마이그레이션 실행 후 별도로 실행) -----
-- 본인 계정을 관리자로 승격하려면 아래를 자신의 username으로 바꿔 실행:
--
--   UPDATE users SET role='admin' WHERE username='YOUR_USERNAME';
--
-- 이후 추가 관리자는 /admin/users 화면에서 부여 가능.
-- =====================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
