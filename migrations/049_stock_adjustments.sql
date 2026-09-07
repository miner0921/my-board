-- =====================================================
-- 049. 재고 조정(item_stock_adjustments) — 작업자 요청 → 관리자 승인 → 반영
-- =====================================================
-- 로컬: 로컬 PostgreSQL / 실서버: Cloud SQL(서울)에서 실행. 재실행 안전.
--
-- ⚠️ 이름에 item_ 접두사가 붙은 이유: 폐기된 feat/inventory 브랜치의 잔재 테이블
--    stock_adjustments(supplier_id 기준)가 DB에 남아 있어 이름이 겹친다.
--    item_stock_movements 와 같은 규칙으로 구분한다(그 잔재는 건드리지 않는다).
--
-- 입출고(수동 입고/출고, 입고증)와는 별개 기능이다.
--   입출고 = 물건이 실제로 들어오고 나간 기록
--   조정   = 장부와 실물이 어긋났을 때 장부를 맞추는 정정 (사유가 반드시 남는다)
--
-- 흐름
--   관리자      : 등록하는 즉시 재고 반영 (status='approved', 요청자=승인자)
--   일반 작업자 : status='pending' 으로만 쌓인다 (재고 안 건드림)
--                 → 관리자가 승인하면 그때 반영, 반려하면 그대로 종료
--
-- 한 줄 = 한 품목. 여러 품목을 한 번에 요청하면 여러 행이 만들어지고,
-- 승인도 여러 행을 골라 한 번에 한다(그룹 테이블 없음).
-- =====================================================

CREATE TABLE IF NOT EXISTS item_stock_adjustments (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('in', 'out')),   -- in=증가 / out=감소
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  expiry_date DATE,        -- mode='in' 일 때 어느 로트로 넣을지
  received_date DATE,      -- 〃
  reason VARCHAR(200) NOT NULL,                              -- 조정 사유 (필수)
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by INTEGER REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMP,
  decide_memo VARCHAR(200)
);

-- 대기 목록(관리자 화면)이 제일 자주 도는 쿼리
CREATE INDEX IF NOT EXISTS idx_item_stock_adjustments_status
  ON item_stock_adjustments(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_item_stock_adjustments_item
  ON item_stock_adjustments(item_id);

-- =====================================================
-- [검증]
--   \d item_stock_adjustments
--   SELECT COUNT(*) FROM item_stock_adjustments;  -- 처음엔 0건
-- =====================================================
