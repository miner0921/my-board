-- =====================================================
-- 026. invoices ↔ upload_batches 연결 키
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 025_upload_batches.sql 실행 후에 실행할 것
--   (이 FK가 upload_batches 테이블 존재를 전제로 함).
--
-- nullable FK. 기존 송장은 NULL 유지(백필 불필요).
--
-- ★ ON DELETE CASCADE 절대 금지 — 스캔기록 보존 원칙.
--   기본 동작(NO ACTION): 송장이 참조 중인 batch는 삭제가 막힘 = 안전.
--   반대로 송장 삭제는 batch를 건드리지 않는다.
--
-- 재실행 안전(IF NOT EXISTS).
-- =====================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS upload_batch_id INTEGER REFERENCES upload_batches(id);

CREATE INDEX IF NOT EXISTS idx_invoices_upload_batch
  ON invoices(upload_batch_id);
