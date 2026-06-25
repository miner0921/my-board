-- =====================================================
-- 028. upload_batches 새 품목 이름 목록 (상세 보기용)
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 025_upload_batches.sql 실행 후에 실행할 것 (그 테이블에 컬럼 추가).
--
-- 목적: 커밋/승격 때 "새로 추가된 품목 이름들"을 기록해, 목록의 "상세 보기"에서
--   집계(개수)뿐 아니라 실제 새 품목 이름까지 보여주기 위함.
--   (items에는 batch 링크가 없어 사후 역추적이 안 되므로 등록 시점에 이름 배열로 저장)
--   값 = commitUploadBatch의 newItems(정규화 품명) 배열.
--
-- nullable(기본 NULL) → 기존 데이터 무영향, 백필 불필요.
-- 재실행 안전(IF NOT EXISTS).
-- =====================================================

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS inserted_item_names TEXT[];
