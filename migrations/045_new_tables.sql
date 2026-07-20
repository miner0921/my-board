-- =====================================================
-- 045. 신규 스키마 테이블 14개 생성 (전부 빈 상태)
-- =====================================================
-- 로컬 개발: pgAdmin/psql 에서 warehouse DB 선택 후 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 1회 실행
--
-- 범위:
--   · 신규 테이블 CREATE 만. 기존 테이블(items/invoices/...)은 일절 건드리지 않는다.
--   · 데이터 이관(백필) 없음 — 이 파일 실행 후 14개 테이블은 모두 0건.
--
-- 이 파일에 넣지 않는 것(→ 051에서 부착):
--   · variants / stock_movements 의 UNIQUE 제약
--   · stock_lots 의 COALESCE 기반 인덱스
--
-- id 방식: 기존 마이그레이션과 동일하게 SERIAL / BIGSERIAL.
--   · 행이 많이 쌓이는 이력·라인 성격 테이블은 BIGSERIAL,
--     마스터 성격 테이블은 SERIAL.
--
-- 재실행 안전 (IF NOT EXISTS). BEGIN/COMMIT 으로 전체 원자 실행.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 조직 계층
-- -----------------------------------------------------

-- 3PL(물류대행사)
CREATE TABLE IF NOT EXISTS tpls (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 업체(화주). tpl_id 는 미지정 가능 → nullable
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  tpl_id INTEGER REFERENCES tpls(id),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 업체별 카테고리. 같은 업체 안에서 이름 중복 금지.
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  name VARCHAR(200) NOT NULL,
  UNIQUE(supplier_id, name)
);

-- -----------------------------------------------------
-- 품목
-- -----------------------------------------------------

-- 품목(상품). 이미지는 기존 items 와 동일하게 BYTEA 직접 저장.
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  category_id INTEGER REFERENCES categories(id),
  name VARCHAR(200) NOT NULL,
  storage_type VARCHAR(20),
  track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  track_stock BOOLEAN NOT NULL DEFAULT TRUE,
  image_data BYTEA,
  image_mime VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 옵션 단위(SKU). product_id 미연결(고아) 허용 → nullable.
-- match_name = 검수 매칭 키. UNIQUE 는 051에서.
CREATE TABLE IF NOT EXISTS variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  sku_code VARCHAR(20),
  opt1_value VARCHAR(100),
  opt2_value VARCHAR(100),
  match_name VARCHAR(300) NOT NULL,
  pack_size INTEGER,
  box_max INTEGER,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 재고
-- -----------------------------------------------------

-- 로트(유통기한/제조일 단위). 둘 다 없는 무로트 재고도 허용 → 양쪽 nullable.
CREATE TABLE IF NOT EXISTS stock_lots (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  expiry_date DATE,
  mfg_date DATE
);

-- 재고 이동(증감) 원장. 모든 재고 변화는 이 테이블에 append.
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  lot_id INTEGER REFERENCES stock_lots(id),
  qty_delta INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL,
  ref_type VARCHAR(20) NOT NULL,
  ref_id BIGINT NOT NULL,
  seq INTEGER NOT NULL,
  reverses_movement_id BIGINT REFERENCES stock_movements(id),
  pack_size_at_time INTEGER,
  memo TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 입고
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  receipt_no VARCHAR(100) NOT NULL,
  source VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  planned_date DATE,
  received_at TIMESTAMP,
  memo TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipt_lines (
  id BIGSERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  planned_qty INTEGER,
  received_qty INTEGER,
  expiry_date DATE,
  mfg_date DATE,
  pack_size_at_time INTEGER
);

-- -----------------------------------------------------
-- 조정 (실사 재고 조정)
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  adjusted_at TIMESTAMP NOT NULL,
  reason VARCHAR(200) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adjustment_lines (
  id BIGSERIAL PRIMARY KEY,
  adjustment_id INTEGER NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  lot_id INTEGER NOT NULL REFERENCES stock_lots(id),
  qty_before INTEGER NOT NULL,
  qty_counted INTEGER NOT NULL,
  qty_delta INTEGER NOT NULL
);

-- -----------------------------------------------------
-- 출고 (재고 차감 — 폐기/샘플 등)
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_outbounds (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  outbound_date DATE NOT NULL,
  reason_code VARCHAR(20) NOT NULL,
  reason_detail VARCHAR(200),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outbound_lines (
  id BIGSERIAL PRIMARY KEY,
  outbound_id INTEGER NOT NULL REFERENCES stock_outbounds(id) ON DELETE CASCADE,
  lot_id INTEGER NOT NULL REFERENCES stock_lots(id),
  quantity INTEGER NOT NULL
);

-- -----------------------------------------------------
-- 송장 상태 이력
-- -----------------------------------------------------

-- 기존 이력 테이블(invoice_reopens 012, invoice_no_changes 044)과 동일 패턴.
CREATE TABLE IF NOT EXISTS invoice_state_changes (
  id BIGSERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMIT;

-- =====================================================
-- [검증]
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('tpls','suppliers','categories','products','variants',
--                         'stock_lots','stock_movements','receipts','receipt_lines',
--                         'stock_adjustments','adjustment_lines','stock_outbounds',
--                         'outbound_lines','invoice_state_changes')
--    ORDER BY table_name;      -- 14행이어야 함
--
--   \d categories              -- UNIQUE(supplier_id, name) 확인
--   \d variants                -- UNIQUE 없음(051에서 부착) 확인
-- =====================================================
