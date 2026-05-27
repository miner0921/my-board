-- =====================================================
-- 008. items.is_auto_created 컬럼 추가
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 권한 정책 협업 시나리오 지원을 위해 도입:
--   - is_auto_created = TRUE  → 공용 품목. 로그인한 누구나 바코드/이름/이미지 수정 가능
--                              (삭제는 여전히 본인만)
--   - is_auto_created = FALSE → 사용자가 직접 등록한 품목. 본인만 수정/삭제
--
-- 자동 등록 = 송장 업로드(invoices/confirm)에서 정규화 결과로 생성된 품목.
-- 백필 기준은 barcode IS NULL.
--   - Phase 2에서는 items.barcode가 NOT NULL이라 NULL 행이 존재할 수 없었음
--   - 따라서 현재 barcode IS NULL인 행은 모두 4-A-2 송장 업로드로 들어온 것
-- =====================================================

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_auto_created BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE items
  SET is_auto_created = TRUE
  WHERE barcode IS NULL;
