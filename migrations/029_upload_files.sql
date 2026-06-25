-- =====================================================
-- 029. 업로드 파일 테이블 (한 등록 단위에 파일 N개)
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 025_upload_batches.sql 실행 후에 (batch_id FK가 그 테이블을 참조).
--
-- 목적: 현 upload_batches의 "발주서 1칸 + 송장 1칸"(임베드) 구조를
--   "한 등록 단위(batch) : 파일 N개" 구조로 확장.
--   upload_batches = 등록 단위(헤더), upload_files = 그에 딸린 발주서/송장 파일들.
--   (임베드 파일 컬럼 제거는 코드 전환 후 STAGE 6의 030에서 — 여기선 안 함)
--
-- ON DELETE CASCADE: batch를 지우면 그 파일들도 함께(파일은 batch 종속물).
--   ※ 송장/검수 데이터(invoices·scan_logs)와는 무관 — 그쪽은 절대 CASCADE 아님.
--
-- 전부 신규/nullable(uploaded_by) → 기존 데이터 무영향. 재실행 안전(IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS upload_files (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('order', 'invoice')),
  file_data BYTEA NOT NULL,
  filename VARCHAR(255),
  mime VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upload_files_batch ON upload_files(batch_id);
