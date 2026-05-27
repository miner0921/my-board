-- =====================================================
-- 007. items.barcode nullable + invoices.customer_type 추가
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 1) items.barcode: 자동 등록되는 품목은 바코드 없이 INSERT 되어야 하므로
--    NOT NULL 제약 해제. UNIQUE 제약은 유지(PostgreSQL은 NULL 여러 개 허용함).
--    바코드는 관리자가 나중에 수동으로 채워넣음.
--
-- 2) invoices.customer_type: 발주서 시트별 분류
--      '사업자'         → 'business'
--      '개인(일반)'      → 'individual'
--      '개인(소매넣기)'  → 'retail'
--      송장에만 있음     → NULL
-- =====================================================

ALTER TABLE items ALTER COLUMN barcode DROP NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20);
