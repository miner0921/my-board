-- =====================================================
-- 027. upload_batches 집계 컬럼 (ledger 통합)
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 025_upload_batches.sql 실행 후에 실행할 것 (그 테이블에 컬럼 추가).
--
-- 목적: 기존 invoice_uploads ledger(집계)를 upload_batches로 통합.
--   커밋/승격 시 이 batch 행에 "새 품목/등록 송장/중복 SKIP" 건수를 기록 →
--   묶음 목록 하나가 "파일 다운로드 + 상태 + 집계"를 모두 표시.
--   (invoice_uploads는 당장 제거하지 않고 한동안 병행 기록 — 하위호환)
--
-- 전부 nullable/default 0 → 기존 데이터 무영향, 백필 불필요.
-- 재실행 안전(IF NOT EXISTS).
-- =====================================================

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS inserted_items    INTEGER NOT NULL DEFAULT 0;

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS inserted_invoices INTEGER NOT NULL DEFAULT 0;

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS skipped_invoices  INTEGER NOT NULL DEFAULT 0;
