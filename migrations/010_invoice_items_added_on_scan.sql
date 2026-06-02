-- =====================================================
-- 010. invoice_items.is_added_on_scan 추가
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- Phase 5-C 현장 추가 품목 기록.
--   - 검수 중 고객 요청으로 송장에 없던 품목이 박스에 추가될 때
--     WrongItemModal에서 [송장에 추가] 선택 → invoice_items에 새 행 INSERT.
--   - is_added_on_scan = TRUE 로 마킹해 송장 상세 화면에서 시각적으로 구분.
--
-- 기본값 FALSE. 기존 행은 자동으로 FALSE (정상 송장 등록분).
-- 재실행 안전.
-- =====================================================

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS is_added_on_scan BOOLEAN NOT NULL DEFAULT FALSE;
