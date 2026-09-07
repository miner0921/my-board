-- =====================================================
-- 050. 재고 조정을 "로트별 목표 수량" 방식으로 재정의
-- =====================================================
-- 로컬: 로컬 PostgreSQL / 실서버: Cloud SQL(서울)에서 실행. 재실행 안전.
--
-- 왜 갈아엎나
--   049는 증가/감소 + 수량(delta) 방식이었다. 현장에서 실사할 때는
--   "이 소비기한 로트가 지금 15개인데 실제로는 12개더라"처럼
--   **눈에 보이는 수량으로 바꾸는** 편이 자연스럽고 실수가 적다.
--   그래서 한 줄 = 한 로트(품목+소비기한)의 목표 수량이 된다.
--     delta = after_quantity - (승인 시점 실제 잔량)
--   before_quantity 는 요청 당시 잔량 스냅샷(참고·감사용)이고,
--   실제 반영은 승인 시점 잔량 기준으로 다시 계산한다(그 사이 입출고가 있을 수 있으므로).
--
-- 049 테이블은 이 기능이 아직 안 쓰인 상태에서만 갈아엎는다(행이 있으면 중단).
-- =====================================================

-- ⚠️ 안전장치를 EXECUTE(동적 SQL)로 도는 이유
--    IF ... AND EXISTS (SELECT 1 FROM item_stock_adjustments) 처럼 쓰면 조건 전체가
--    한 SQL 문으로 파싱·플래닝돼서, 테이블이 아직 없는 서버(049 안 돌린 실서버)에서는
--    to_regclass 검사가 무의미하게 "relation does not exist" 로 터진다.
--    EXECUTE 는 실행 시점에만 파싱되므로 IF 안쪽으로 안전하게 숨길 수 있다.
DO $$
DECLARE
  n bigint := 0;
BEGIN
  IF to_regclass('item_stock_adjustments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM item_stock_adjustments' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '기존 조정 데이터가 있습니다 — 수동 확인 후 진행하세요.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS item_stock_adjustments;

CREATE TABLE item_stock_adjustments (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  -- 기존 로트를 고쳐 잡는 경우 그 로트. 새 소비기한을 만드는 경우 NULL.
  lot_id INTEGER REFERENCES item_lots(id) ON DELETE SET NULL,
  expiry_date DATE,                    -- 로트 키(소비기한). NULL = 소비기한 없는 로트
  received_date DATE,                  -- 새 로트를 만들 때의 입고일
  before_quantity INTEGER NOT NULL,    -- 요청 당시 잔량 스냅샷
  after_quantity INTEGER NOT NULL CHECK (after_quantity >= 0),  -- 바꾸려는 수량
  reason VARCHAR(200) NOT NULL,        -- 조정 사유 (필수)
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by INTEGER REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMP,
  decide_memo VARCHAR(200)
);

CREATE INDEX idx_item_stock_adjustments_status
  ON item_stock_adjustments(status, id DESC);
CREATE INDEX idx_item_stock_adjustments_item
  ON item_stock_adjustments(item_id);

-- =====================================================
-- [검증]
--   \d item_stock_adjustments
--   SELECT COUNT(*) FROM item_stock_adjustments;  -- 처음엔 0건
-- =====================================================
