-- =====================================================
-- 002. items 이미지 BYTEA 전환
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 사유: Vercel은 파일시스템이 ephemeral이라 public/uploads 영구저장 불가.
--       게시판이 이미 image_data(BYTEA) + image_mime 방식으로 운영 중이라
--       items도 같은 패턴으로 통일.
--
-- 전제: items에 아직 데이터가 없는 시점에서 실행 (DROP COLUMN으로 충분).
-- 재실행 안전: IF EXISTS / IF NOT EXISTS 사용.
-- =====================================================

ALTER TABLE items DROP COLUMN IF EXISTS image_url;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_data BYTEA;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_mime VARCHAR(100);
