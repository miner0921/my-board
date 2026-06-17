-- =====================================================
-- 019. 송장/품목 숨김(soft delete)
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- "삭제"를 완전삭제가 아니라 숨김으로 전환한다.
--   - deleted_at IS NULL  → 보임(활성)
--   - deleted_at 값 있음   → 숨김 (목록/검색/진행률/스캔에서 제외)
--   - 자식 데이터(scan_logs/invoice_items 등)는 그대로 보존 → 검수기록 안 지워짐
--   - 복구 = deleted_at/deleted_by 를 NULL 로
--
-- 기존 행은 전부 NULL(=보임). 재실행 안전.
-- =====================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);

ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON invoices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items(deleted_at);
