-- =====================================================
-- (테스트 전용) 완료 송장 더미 150건 주입 — 페이지네이션 검증용
-- ★★★ 검증 후 반드시 _test_cleanup_invoices.sql 로 삭제 ★★★
-- =====================================================
-- 실행: Cloud SQL(서울) — Cloud SQL Studio / psql.
--
-- 식별: 모든 더미는 'TEST-' 접두어(송장) / 'TEST-ITEM-' 바코드(품목)로 식별.
--       실제 데이터와 안 섞인다. 재실행해도 안전(NOT EXISTS 가드).
--
-- 무엇을 만드나:
--   · 더미 품목 2개 (TEST-ITEM-1 / TEST-ITEM-2) — invoice_items 연결용.
--   · 완료 송장 150건 (invoice_no = 'TEST-1' ~ 'TEST-150').
--       - status = 'completed'
--       - completed_at/created_at 을 0~37일에 걸쳐 분산(날짜 그룹 확인용:
--         오늘/어제/이번주/날짜별/이전 그룹이 모두 생기게).
--       - recipient_name: g 131~140 은 '검증대상자'(★ 100건 뒤에 위치 →
--         "검색이 DB 전체 대상인지" 확인용), 그 외 'TEST수령인{g}'.
--   · invoice_items: 모든 송장에 품목A 1행, 짝수 id 송장엔 품목B 1행 추가
--       (scanned_count = quantity → 진행률 N/N, SUM 집계 확인).
-- =====================================================

-- (1) 더미 품목 2개 (없을 때만) ---------------------------------------
INSERT INTO items (barcode, name, created_by, is_auto_created)
SELECT v.barcode, v.name, (SELECT MIN(id) FROM users), false
FROM (VALUES
        ('TEST-ITEM-1', 'TEST-검증품목A'),
        ('TEST-ITEM-2', 'TEST-검증품목B')
     ) AS v(barcode, name)
WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.barcode = v.barcode);

-- (2) 완료 송장 150건 (없을 때만) -------------------------------------
INSERT INTO invoices
  (invoice_no, status, completed_at, created_at,
   created_by, completed_by, recipient_name, recipient_phone)
SELECT
  'TEST-' || g,
  'completed',
  now() - make_interval(days => (g / 4)) - make_interval(mins => g),
  now() - make_interval(days => (g / 4)) - make_interval(mins => g),
  (SELECT MIN(id) FROM users),
  (SELECT MIN(id) FROM users),
  CASE WHEN g BETWEEN 131 AND 140 THEN '검증대상자'
       ELSE 'TEST수령인' || g END,
  '010-0000-' || lpad(g::text, 4, '0')
FROM generate_series(1, 150) AS g
WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_no = 'TEST-' || g);

-- (3a) 모든 TEST 송장에 품목A 1행 (quantity 1~2, 완전 스캔) ------------
INSERT INTO invoice_items (invoice_id, item_id, quantity, scanned_count)
SELECT inv.id, it.id, 1 + (inv.id % 2), 1 + (inv.id % 2)
FROM invoices inv
CROSS JOIN (SELECT id FROM items WHERE barcode = 'TEST-ITEM-1' LIMIT 1) it
WHERE inv.invoice_no LIKE 'TEST-%'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_items ii
     WHERE ii.invoice_id = inv.id AND ii.item_id = it.id
  );

-- (3b) 짝수 id TEST 송장에 품목B 1행 (2품목 송장 = SUM 집계 확인) -------
INSERT INTO invoice_items (invoice_id, item_id, quantity, scanned_count)
SELECT inv.id, it.id, 1, 1
FROM invoices inv
CROSS JOIN (SELECT id FROM items WHERE barcode = 'TEST-ITEM-2' LIMIT 1) it
WHERE inv.invoice_no LIKE 'TEST-%'
  AND (inv.id % 2) = 0
  AND NOT EXISTS (
    SELECT 1 FROM invoice_items ii
     WHERE ii.invoice_id = inv.id AND ii.item_id = it.id
  );

-- (4) 주입 확인 -------------------------------------------------------
SELECT
  (SELECT count(*) FROM invoices WHERE invoice_no LIKE 'TEST-%')      AS dummy_invoices,
  (SELECT count(*) FROM invoices
     WHERE invoice_no LIKE 'TEST-%' AND recipient_name = '검증대상자') AS target_rows,
  (SELECT count(*) FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.invoice_no LIKE 'TEST-%')                                 AS dummy_items;
-- 기대값: dummy_invoices=150, target_rows=10, dummy_items=225(150 + 짝수 75)
