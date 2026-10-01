-- =====================================================
-- 051. 정산 관리 (settlement_*) — 월 단위 물류대행 정산내역서
-- =====================================================
-- 로컬: 로컬 PostgreSQL / 실서버: Cloud SQL(서울)에서 실행. 재실행 안전.
--
-- 원본 엑셀("만월회x더블에스 정산 N월.xlsx") 구조를 그대로 옮긴다.
--   정산 내역서   → settlement_months + settlement_lines  (최종 산출물)
--   유통가공 세부내역 ┐
--   입출고 세부내역   ┴→ settlement_daily        (일자별 원본)
--   출고현황          → settlement_shipments     (행 원본 + 정산 분류)
--   협의건            → settlement_agreements    (행 원본)
--
-- 자동 수량은 저장하지 않는다. 원본 3개 테이블을 집계해서 그때그때 계산한다
-- (lib/settlement.ts 의 computeAutoQty). 캐시 테이블이 없으니 원본과 어긋날 일이 없다.
--
-- ⚠️ settlement_shipments / settlement_agreements 에는 수하인 성명·주소가 들어간다.
--    정산 화면 전체가 관리자 전용인 이유. 목록 쿼리에서 불필요하면 SELECT 하지 않는다.
-- =====================================================

-- ── 월 정산 헤더 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement_months (
  id SERIAL PRIMARY KEY,
  ym VARCHAR(7) UNIQUE NOT NULL,                              -- '2026-08'
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TIMESTAMP
);

-- ── 정산내역서 행 (7개 섹션 전부 여기) ────────────────
-- 금액은 저장하지 않는다. 항상 unit_price * qty (VAT 포함 단가라 배수 없음).
-- qty_source: NULL 이면 사람이 직접 입력, 값이 있으면 원본 집계에서 자동으로 채움.
CREATE TABLE IF NOT EXISTS settlement_lines (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES settlement_months(id) ON DELETE CASCADE,
  section VARCHAR(30) NOT NULL,      -- courier / packing / material / inout / storage / processing / etc
  sort_no INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT '',   -- 세부항목. 빈 값이면 윗행과 묶인 행(원본 병합 셀)
  note VARCHAR(200) NOT NULL DEFAULT '',   -- 비고
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  qty NUMERIC(14, 2),                      -- NULL 이면 표에 '-' (기타 섹션)
  qty_source VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_settlement_lines_month
  ON settlement_lines(month_id, sort_no);

-- ── 유통가공 / 입출고 세부내역 (일자별 원본) ──────────
-- 두 시트가 "라벨 x 날짜 = 수량" 으로 모양이 같아 한 테이블에 담는다.
-- 입출고는 입고/출고를 구분해야 해서 source 를 둘로 나눴다.
-- 월말 재고(PLT 보관 / P 보관)처럼 날짜 없이 합계만 있는 값은 work_date IS NULL.
CREATE TABLE IF NOT EXISTS settlement_daily (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES settlement_months(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL
    CHECK (source IN ('processing', 'inout_in', 'inout_out')),
  label VARCHAR(100) NOT NULL,
  work_date DATE,
  qty NUMERIC(14, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlement_daily_month
  ON settlement_daily(month_id, source);

-- ── 출고현황 (행 원본) ────────────────────────────────
-- settle_type = 업로드 시점에 계산한 정산 분류:
--   반품  : 구분이 '반품'
--   청구  : 구분이 '출고' 이고 주문번호에 '청구' 포함 (누락/오배송/파손 등)
--   출고  : 나머지
-- 택배비 '출 고' 수량은 청구건을 포함한 전체다(원본 내역서와 동일).
-- 청구 행에서 같은 건수를 마이너스 단가로 상계해 실질 0원이 되고, 내역만 표에 남는다.
CREATE TABLE IF NOT EXISTS settlement_shipments (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES settlement_months(id) ON DELETE CASCADE,
  seq INTEGER,                        -- 엑셀 No
  kind VARCHAR(20),                   -- 원본 '구분' (출고 / 반품)
  order_date DATE,                    -- 최초지시일
  tracking_no VARCHAR(50),
  order_no VARCHAR(200),
  cancel_reason VARCHAR(200),
  receiver_name VARCHAR(100),
  receiver_addr VARCHAR(300),
  sender_name VARCHAR(100),
  product_name TEXT,
  settle_type VARCHAR(10) NOT NULL
    CHECK (settle_type IN ('출고', '반품', '청구'))
);
CREATE INDEX IF NOT EXISTS idx_settlement_shipments_month
  ON settlement_shipments(month_id, settle_type);

-- ── 협의건 (행 원본) ──────────────────────────────────
-- 행 수가 곧 택배비 '항공, 도선료' 수량이다.
-- 운임합계 / 제주연계는 참고용 원본 — 정산 금액에는 쓰지 않는다.
CREATE TABLE IF NOT EXISTS settlement_agreements (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES settlement_months(id) ON DELETE CASCADE,
  pickup_date DATE,                   -- 집하일자
  tracking_no VARCHAR(50),
  kind VARCHAR(20),                   -- 작업구분 (출고 / 반품)
  freight_total NUMERIC(14, 2),
  receiver_name VARCHAR(100),
  receiver_addr VARCHAR(300),
  product_name TEXT,
  jeju_link NUMERIC(14, 2)            -- 제주연계
);
CREATE INDEX IF NOT EXISTS idx_settlement_agreements_month
  ON settlement_agreements(month_id);

-- =====================================================
-- [검증]
--   \d settlement_months
--   SELECT COUNT(*) FROM settlement_months;   -- 처음엔 0건
-- =====================================================
