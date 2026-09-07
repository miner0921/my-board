-- =====================================================
-- 045. 재고 관리 — 로트(item_lots) + 입출고 이력(item_stock_movements)
-- =====================================================
-- 로컬: 로컬 PostgreSQL / 실서버: Cloud SQL(서울)에서 실행. 재실행 안전(IF NOT EXISTS).
--
-- 설계 요지
--   재고는 "품목별 숫자 하나"가 아니라 **로트 단위**로 쌓는다.
--   로트 = (품목, 소비기한, 입고일) 묶음의 잔량.
--
--   차감 순서는 정렬 한 줄로 두 정책을 모두 만족한다:
--     ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC
--       - 소비기한 관리 품목 → 소비기한 빠른 것부터 (FEFO)
--       - 소비기한 없는 품목(expiry_date IS NULL) → 입고일 빠른 것부터 (FIFO)
--   즉 두 종류 품목을 한 테이블/한 쿼리로 처리한다. 분기 없음.
--
--   items.expiry_managed 는 "입고 시 소비기한 입력이 필수인가"(UI 검증)에만 쓴다.
--   차감 로직은 이 플래그를 보지 않는다 — expiry_date 의 NULL 여부만 본다.
-- =====================================================

-- 1) 품목: 소비기한 관리 대상 여부 (입고 폼에서 소비기한 필수 입력 강제)
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS expiry_managed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) 재고 로트
CREATE TABLE IF NOT EXISTS item_lots (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expiry_date DATE,                                   -- NULL = 소비기한 없음(입고일 순 차감)
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,   -- 입고일
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),  -- 현재 잔량(음수 금지)
  memo VARCHAR(200),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 같은 (품목, 소비기한, 입고일)이면 새 행을 만들지 않고 수량을 합친다.
-- NULL 은 UNIQUE 에서 서로 다른 값 취급이라, COALESCE 로 고정 날짜에 매핑해 묶는다.
-- (PG15+ 의 NULLS NOT DISTINCT 대신 표현식 인덱스 — 구버전 로컬에서도 동작)
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_lots_key
  ON item_lots (item_id, COALESCE(expiry_date, DATE '0001-01-01'), received_date);

-- 차감 시 스캔하는 정렬 그대로의 인덱스
CREATE INDEX IF NOT EXISTS idx_item_lots_fefo
  ON item_lots (item_id, expiry_date, received_date, id);

-- 3) 입출고 이력 (원장)
--
-- 이름이 item_stock_movements 인 이유: 로컬 DB에 폐기된 feat/inventory 브랜치의
--   stock_movements(변형/화주 기준, supplier_id·variant_id·qty_delta)가 남아 있어
--   이름이 겹친다. 이 시스템은 items 기준이라 item_ 접두사로 구분한다.
--   (그 잔재 테이블들은 이 마이그레이션이 건드리지 않는다)
--
-- ⚠️ 재고 잔량의 진실은 item_lots.quantity 다. 이 테이블은 "무슨 일이 있었나" 기록.
--    (047 이후) 모든 행이 로트에 반영되지만, 그래도 재고는 item_lots 에서 읽는다.
CREATE TABLE IF NOT EXISTS item_stock_movements (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  lot_id INTEGER REFERENCES item_lots(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL,             -- + 입고 / - 출고
  reason VARCHAR(30) NOT NULL,        -- inbound / manual_out / invoice_out / invoice_return
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  receipt_id INTEGER,                 -- 입고증 (046에서 FK 부착)
  expiry_date DATE,                   -- 이력 보존용 스냅샷 (로트가 사라져도 남게)
  received_date DATE,                 -- 〃
  memo VARCHAR(200),
  user_id INTEGER REFERENCES users(id),
  reversed_at TIMESTAMP,              -- 원복된 출고 (검수 재개) — 멱등 판단 키
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_item_stock_movements_item    ON item_stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_stock_movements_created ON item_stock_movements(created_at DESC);
-- 송장 차감/원복 멱등 판단용 (미역전 출고 존재 여부)
CREATE INDEX IF NOT EXISTS idx_item_stock_movements_invoice_open
  ON item_stock_movements(invoice_id) WHERE invoice_id IS NOT NULL AND reversed_at IS NULL;

-- =====================================================
-- [검증]
--   \d item_lots
--   SELECT COUNT(*) FROM item_lots;       -- 처음엔 0건
--   SELECT COUNT(*) FROM item_stock_movements; -- 처음엔 0건
--   SELECT COUNT(*) FROM items WHERE expiry_managed;  -- 처음엔 0건
-- =====================================================
