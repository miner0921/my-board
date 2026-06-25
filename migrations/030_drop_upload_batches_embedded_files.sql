-- =====================================================
-- 030. (STAGE 6) upload_batches 임베드 파일 컬럼 제거
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★★ 비가역(컬럼·데이터 영구 삭제). 반드시 아래 전제 충족 후 실행:
--   1) 코드가 임베드 컬럼을 더 이상 참조 안 함 — STAGE 1에서 upload_files로 전환 완료.
--      (grep 확인: upload_batches.order_*/invoice_* raw 컬럼 참조 0)
--   2) 임베드 컬럼의 파일 바이트가 upload_files로 이관됐거나 불필요 —
--      035_reset_test_data.sql로 upload_batches를 비웠다면 임베드 데이터 0 → 백필 불필요.
--   ★ 실행 순서: 035(초기화) → 030(이 파일). 035 없이 단독 실행 시 기존 임베드 파일 소멸 주의.
--
-- 제거 컬럼(025_upload_batches.sql 정의 기준):
--   order_file_data, order_filename, order_mime, order_uploaded_by, order_uploaded_at,
--   invoice_file_data, invoice_filename, invoice_mime, invoice_uploaded_by, invoice_uploaded_at
--   (파일은 이제 upload_files 테이블에 보관 — 029)
--
-- 재실행 안전(DROP COLUMN IF EXISTS).
-- =====================================================

ALTER TABLE upload_batches
  DROP COLUMN IF EXISTS order_file_data,
  DROP COLUMN IF EXISTS order_filename,
  DROP COLUMN IF EXISTS order_mime,
  DROP COLUMN IF EXISTS order_uploaded_by,
  DROP COLUMN IF EXISTS order_uploaded_at,
  DROP COLUMN IF EXISTS invoice_file_data,
  DROP COLUMN IF EXISTS invoice_filename,
  DROP COLUMN IF EXISTS invoice_mime,
  DROP COLUMN IF EXISTS invoice_uploaded_by,
  DROP COLUMN IF EXISTS invoice_uploaded_at;
