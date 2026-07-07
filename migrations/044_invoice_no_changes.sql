-- =====================================================
-- 044. invoice_no_changes 테이블 (송장번호 변경 이력)
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- 송장 상세에서 송장번호(invoice_no)를 변경할 때 "이전번호 → 새번호 · 시각 ·
--   작업자"를 이력으로 남긴다. 상세 페이지에서 재개 이력 박스처럼 표시.
--
-- FK 방식: 기존 이력 테이블 invoice_reopens(012)와 동일하게
--   invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE.
--   (이 시스템은 하드 삭제를 안 하고 soft delete(deleted_at)만 하므로 CASCADE가
--    실제로 발화하지 않는다 — 이력은 soft delete로는 지워지지 않는다.)
--
-- 컬럼 타입: old_no / new_no 는 invoices.invoice_no 와 맞춰 VARCHAR(100).
--
-- 이 테이블은 신규라 기존 데이터를 잠글 게 없다 → 일반 CREATE TABLE.
-- 재실행 안전 (IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_no_changes (
  id BIGSERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  old_no VARCHAR(100) NOT NULL,
  new_no VARCHAR(100) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_no_changes_invoice
  ON invoice_no_changes(invoice_id);
