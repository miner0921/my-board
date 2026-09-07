-- =====================================================
-- 046. 입고증(stock_receipts) — 사무실에서 예정 등록 → 인쇄 → 현장에서 바코드 스캔 입고
-- =====================================================
-- 로컬: 로컬 PostgreSQL / 실서버: Cloud SQL(서울)에서 실행. 재실행 안전.
--
-- 흐름
--   1) 사무실: 입고 예정 품목 목록을 입고증으로 등록 (status='open')
--   2) 인쇄: 입고증에 receipt_no 를 Code128 바코드로 찍어 출력
--   3) 현장: 그 바코드를 스캔 → 예정 품목이 쭉 뜸 → 품목별 실제 수량·소비기한 입력
--   4) 등록하면 즉시 item_lots 에 로트 생성 + item_stock_movements(inbound) 기록
--   5) 다 끝나면 "입고 완료" → status='received'
--
--   3~4는 여러 번 나눠 할 수 있다(한 품목을 소비기한별로 쪼개 입고하는 게 정상).
--   그래서 received_quantity 는 누적이고, planned_quantity 와 달라도 막지 않는다.
--
-- receipt_no: INSERT 후 id 로 'RC' || LPAD(id,7,'0') 형태를 채운다(앱에서 처리).
--   id 기반이라 채번 경합이 없고, Code128 로 그대로 인쇄된다.
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_receipts (
  id SERIAL PRIMARY KEY,
  receipt_no VARCHAR(50) UNIQUE,               -- 바코드 문자열 (INSERT 직후 앱이 채움)
  title VARCHAR(200),                          -- 메모성 제목 (예: "9월 1일 A업체")
  status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open / received / canceled
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMP,
  received_by INTEGER REFERENCES users(id),
  deleted_at TIMESTAMP                         -- soft delete (하드 삭제 없음 — 프로젝트 규칙)
);

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  planned_quantity INTEGER NOT NULL DEFAULT 0,   -- 사무실에서 적은 예정 수량
  received_quantity INTEGER NOT NULL DEFAULT 0,  -- 현장에서 실제 입고한 누적 수량
  UNIQUE(receipt_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_receipts_status ON stock_receipts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_receipt_items_receipt ON stock_receipt_items(receipt_id);

-- 045에서 미리 뚫어둔 item_stock_movements.receipt_id 에 FK 부착
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_item_stock_movements_receipt'
  ) THEN
    ALTER TABLE item_stock_movements
      ADD CONSTRAINT fk_item_stock_movements_receipt
      FOREIGN KEY (receipt_id) REFERENCES stock_receipts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- [검증]
--   \d stock_receipts
--   SELECT COUNT(*) FROM stock_receipts;  -- 처음엔 0건
-- =====================================================
