-- =====================================================
-- 033. upload_batches 등록 단위 soft delete (통째 삭제/복구)
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 025_upload_batches.sql 실행 후에 (그 테이블에 컬럼 추가).
--
-- 목적: "등록건 통째 삭제(교체 대체)"를 위해 batch 자체에 soft delete 표시.
--   - deleted_at IS NULL → 보임 / 값 있음 → 삭제됨(목록에서 숨김, 복구 가능)
--   - ★ 완전삭제 아님 — 그 batch의 invoices/scan_logs/upload_files는 보존(분쟁증거·복구).
--   - batch 삭제 시 그에 딸린 invoices는 별도로 invoices.deleted_at으로 함께 숨김(코드에서).
--
-- nullable → 기존 batch는 전부 보임. 재실행 안전(IF NOT EXISTS).
-- =====================================================

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_upload_batches_deleted_at
  ON upload_batches(deleted_at);
