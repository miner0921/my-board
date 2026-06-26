-- =====================================================
-- 037. 검색(ILIKE '%q%') 가속 — pg_trgm GIN 인덱스
-- =====================================================
-- 목적: 송장/품목 검색은 앞쪽 와일드카드 '%q%' ILIKE라 일반 B-tree
--       인덱스를 못 타고 Seq Scan으로 떨어진다. trgm(3-gram) GIN
--       인덱스를 깔면 플래너가 ILIKE '%q%'에 이 인덱스를 자동 선택한다.
--
-- ★ 코드 변경 0 — 기존 ILIKE 쿼리 그대로 인덱스를 탄다.
--   · 송장: lib/invoice-list.ts  (invoice_no/order_no/recipient_name/recipient_phone)
--   · 품목: app/api/warehouse/items/route.ts, app/warehouse/items/page.tsx
--            (name/barcode/product_code)
--
-- ★ 인덱스만 추가 — 데이터/스키마/검수 로직 변경 0. 재실행 안전(IF NOT EXISTS).
--
-- ⚠️ 한계: trgm은 3글자(trigram) 단위라 검색어가 3글자 이상일 때만 가속된다.
--          한글 1~2글자 검색은 trigram을 못 만들어 그대로 Seq Scan으로 폴백한다.
--          (정상 동작 — 짧은 검색어는 어차피 후보가 많아 인덱스 이득도 작다.)
--
-- 실행 위치: Cloud SQL(서울)에서 직접. 현재 데이터가 적어 즉시 완료된다.
-- =====================================================

-- (0) 확장 설치 — DB당 1회. Cloud SQL for PostgreSQL 지원 확장(화이트리스트).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- (1) 송장 검색 4컬럼 ------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_no_trgm
  ON invoices USING gin (invoice_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_order_no_trgm
  ON invoices USING gin (order_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_recipient_name_trgm
  ON invoices USING gin (recipient_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_recipient_phone_trgm
  ON invoices USING gin (recipient_phone gin_trgm_ops);

-- (2) 품목 검색 3컬럼 ------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON items USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_barcode_trgm
  ON items USING gin (barcode gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_product_code_trgm
  ON items USING gin (product_code gin_trgm_ops);

-- =====================================================
-- [검증]
--   (a) 인덱스 7개 생성 확인:
--       SELECT indexname FROM pg_indexes WHERE indexname LIKE '%trgm%';
--
--   (b) 효과 확인 — 검색 쿼리가 인덱스를 타는지:
--       EXPLAIN ANALYZE
--       SELECT id FROM invoices WHERE invoice_no ILIKE '%TEST-001%';
--       → 'Bitmap Index Scan on idx_invoices_invoice_no_trgm' 가 보이면 성공.
--
--   ★ 더미 150건은 너무 적어 플래너가 "Seq Scan이 더 싸다"고 판단해
--     인덱스를 안 탈 수 있다(정상). 그때는 아래로 강제 후 확인:
--       SET enable_seqscan = off;
--       EXPLAIN ANALYZE SELECT id FROM invoices WHERE invoice_no ILIKE '%TEST-001%';
--       RESET enable_seqscan;
--     실제 이득은 수천~수만 건부터 나타난다.
-- =====================================================

-- =====================================================
-- [운영 데이터가 많을 때 — CONCURRENTLY 옵션]
--   일반 CREATE INDEX는 생성 동안 그 테이블의 '쓰기'를 잠근다(읽기는 가능).
--   지금은 데이터가 적어 순간이라 위 구문 그대로면 된다.
--
--   훗날 invoices/items가 수십만 건이라 생성이 길어질 것 같으면, 잠금 없는
--   CONCURRENTLY로 만든다. 단:
--     · 트랜잭션 블록 안에서 실행 불가 → 반드시 '한 문장씩' 개별 실행.
--       (Cloud SQL Studio에서 전체 선택 실행 말고 줄 단위로 실행)
--     · 일반보다 느리고, 실패 시 INVALID 인덱스가 남을 수 있다
--       (DROP INDEX 후 재시도). 확인:
--         SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--     · CREATE EXTENSION은 CONCURRENTLY와 무관 — 그대로 먼저 1회 실행.
--
--   예) 한 문장씩:
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_invoice_no_trgm
--       ON invoices USING gin (invoice_no gin_trgm_ops);
--     -- (나머지 6개도 동일하게 한 줄씩)
-- =====================================================
