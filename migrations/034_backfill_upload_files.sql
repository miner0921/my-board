-- =====================================================
-- 034. (백필) 기존 upload_batches 임베드 파일 → upload_files 이관
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 029_upload_files.sql 실행 후, STAGE 1 코드 배포 전후에 1회 실행.
--
-- 목적: 2단계까지 임베드 컬럼(order_file_data/invoice_file_data)에 저장돼 있던
--   기존 batch의 원본 바이트를 upload_files로 옮겨, 새 구조에서도 다운로드 가능하게.
--   (데이터가 테스트뿐이라 양은 적음. 이관 후 STAGE 6의 030에서 임베드 컬럼 DROP.)
--
-- 재실행 안전: NOT EXISTS 가드로 이미 이관된 batch는 건너뜀(중복 INSERT 방지).
--   ※ 이 가드는 "그 batch에 같은 kind 파일이 이미 있으면 스킵" — 백필 한정 안전장치.
-- =====================================================

-- 발주서 이관
INSERT INTO upload_files (batch_id, kind, file_data, filename, mime, uploaded_by, uploaded_at)
SELECT b.id, 'order', b.order_file_data, b.order_filename, b.order_mime,
       b.order_uploaded_by, COALESCE(b.order_uploaded_at, b.created_at)
  FROM upload_batches b
 WHERE b.order_file_data IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM upload_files f
      WHERE f.batch_id = b.id AND f.kind = 'order'
   );

-- 송장 이관
INSERT INTO upload_files (batch_id, kind, file_data, filename, mime, uploaded_by, uploaded_at)
SELECT b.id, 'invoice', b.invoice_file_data, b.invoice_filename, b.invoice_mime,
       b.invoice_uploaded_by, COALESCE(b.invoice_uploaded_at, b.created_at)
  FROM upload_batches b
 WHERE b.invoice_file_data IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM upload_files f
      WHERE f.batch_id = b.id AND f.kind = 'invoice'
   );
