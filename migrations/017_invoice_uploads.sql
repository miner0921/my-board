-- =====================================================
-- 017. 발주서/송장 업로드 이력 테이블
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- 업로드 모달에서 "어떤 파일을 언제, 누가 올렸고 몇 건 등록됐는지" 보여주기 위함.
-- /api/warehouse/invoices/confirm 성공 시 한 행 INSERT.
-- 재실행 안전(IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_uploads (
  id SERIAL PRIMARY KEY,
  order_filename    VARCHAR(255),
  invoice_filename  VARCHAR(255),
  inserted_items    INTEGER NOT NULL DEFAULT 0,
  inserted_invoices INTEGER NOT NULL DEFAULT 0,
  skipped_invoices  INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_uploads_uploaded_at
  ON invoice_uploads(uploaded_at DESC);
