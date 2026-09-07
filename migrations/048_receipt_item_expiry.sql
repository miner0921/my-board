-- =====================================================
-- 048. 입고증 줄에 소비기한 — 같은 품목도 소비기한별로 여러 줄
-- =====================================================
-- 로컬: 로컬 PostgreSQL / 실서버: Cloud SQL(서울)에서 실행. 재실행 안전.
--
-- 왜
--   실무에서 같은 품목이 소비기한 두 종류로 들어온다.
--   지금까지는 (입고증, 품목)이 UNIQUE 라 한 줄뿐이었고 소비기한은 현장에서만 적었다.
--   → 예정 단계에서 소비기한별로 줄을 나눠 적고, 현장은 그 값을 기본값으로 받아 고친다.
--
-- 키
--   item_lots 와 같은 방식. NULL(소비기한 없음)은 UNIQUE 에서 서로 다른 값 취급이라
--   COALESCE 로 고정 날짜에 매핑해 한 줄로 묶는다.
-- =====================================================

ALTER TABLE stock_receipt_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;   -- 예정 소비기한 (NULL = 미지정)

-- 기존 UNIQUE(receipt_id, item_id) 해제 (PG 기본 제약 이름)
ALTER TABLE stock_receipt_items
  DROP CONSTRAINT IF EXISTS stock_receipt_items_receipt_id_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_receipt_items_key
  ON stock_receipt_items (receipt_id, item_id, COALESCE(expiry_date, DATE '0001-01-01'));

-- =====================================================
-- [검증]
--   \d stock_receipt_items      -- expiry_date 컬럼 + uq_stock_receipt_items_key 확인
--   SELECT COUNT(*) FROM stock_receipt_items WHERE expiry_date IS NOT NULL;  -- 처음엔 0건
-- =====================================================
