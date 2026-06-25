-- =====================================================
-- (테스트 전용) 더미 송장/품목 삭제 — 검증 후 필수 실행
-- =====================================================
-- 실행: Cloud SQL(서울) — Cloud SQL Studio / psql.
-- _test_seed_invoices.sql 로 넣은 'TEST-' 더미만 정확히 제거한다.
-- (FK 순서: invoice_items → invoices → items)
-- =====================================================

-- (1) 더미 송장의 품목 매핑 제거
DELETE FROM invoice_items
 WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_no LIKE 'TEST-%');

-- (2) 더미 송장 제거
DELETE FROM invoices WHERE invoice_no LIKE 'TEST-%';

-- (3) 더미 품목 제거 (위에서 매핑을 지웠으니 FK 안전)
DELETE FROM items WHERE barcode IN ('TEST-ITEM-1', 'TEST-ITEM-2');

-- (4) 삭제 확인 -------------------------------------------------------
SELECT
  (SELECT count(*) FROM invoices WHERE invoice_no LIKE 'TEST-%')        AS dummy_invoices_left,
  (SELECT count(*) FROM items    WHERE barcode LIKE 'TEST-ITEM-%')      AS dummy_items_left,
  (SELECT count(*) FROM invoices)                                       AS total_invoices_now;
-- 기대값: dummy_invoices_left=0, dummy_items_left=0,
--         total_invoices_now = 실제 운영 송장 수(없으면 0)

-- ─────────────────────────────────────────────────────────────
-- [대안] 운영 시작 전이라 통째로 비우려면 위 (1)~(3) 대신 035 사용:
--   migrations/035_reset_test_data.sql (TRUNCATE ... RESTART IDENTITY)
--   ★ 단 035는 실데이터까지 전부 날리므로 운영 데이터가 있으면 금지.
-- ─────────────────────────────────────────────────────────────
