-- =====================================================
-- 005. 로그인 시도 추적 (login_attempts) — Rate Limit용
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 정책 (lib/rate-limit.ts):
--   같은 username 또는 같은 IP가 최근 1분 내 5회 실패 → 10분 차단.
--   성공 시도도 기록(감사용).
-- =====================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(20),
  ip_address INET,
  success BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
  ON login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON login_attempts(ip_address, attempted_at DESC);

-- 정리(선택): 7일 이상 된 기록 주기적으로 삭제
-- DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '7 days';
