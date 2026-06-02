-- =====================================================
-- 009. invoices.scan_started_at / scan_started_by 추가
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- Phase 5-B 검수 시간 추적용.
--   - scan_started_at: 해당 송장의 첫 품목 스캔이 발생한 시점
--   - scan_started_by: 그 첫 스캔을 한 사용자
--
-- 두 컬럼 모두 nullable.
--   - 첫 스캔 이후엔 COALESCE로 덮어쓰지 않음 (최초 시점 보존)
--   - completed_at - scan_started_at = 실제 검수 소요 시간
--
-- 백필 없음.
--   - 이 마이그레이션 이전에 등록/완료된 송장은 모두 NULL로 둔다.
--   - created_at은 송장 등록(파일 업로드) 시점이지 검수 시작 시점이 아니라
--     믿을 만한 백필 데이터원이 없다.
--   - 상세 페이지에서 NULL이면 "기록 없음"으로 표시.
--
-- 재실행 안전 (IF NOT EXISTS).
-- =====================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS scan_started_at TIMESTAMP;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS scan_started_by INTEGER REFERENCES users(id);
