-- =====================================================
-- 004. 감사 로그 테이블 (access_logs)
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 출고시스템의 모든 변경 작업(POST/PUT/DELETE)과 페이지/단일 조회(GET)를 기록합니다.
-- 이미지 GET 라우트는 노이즈가 많아 제외합니다.
-- 게시판 API는 영향받지 않습니다.
-- =====================================================

CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,        -- 예: 'item.list', 'item.create', 'item.update', 'item.delete'
  target_type VARCHAR(50),            -- 예: 'item', 'invoice', 'scan'
  target_id INTEGER,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_created
  ON access_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_target
  ON access_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created
  ON access_logs(created_at DESC);

-- 정리(선택): 운영 중 로그가 누적되면 주기적으로 오래된 것 삭제
-- DELETE FROM access_logs WHERE created_at < NOW() - INTERVAL '90 days';
