-- =====================================================
-- 035. (1회용) 테스트 데이터 초기화 — 운영 시작 전 비움
-- ★★★ 1회용 초기화 — 운영 데이터 있을 때 재실행 절대 금지 ★★★
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★★ hard delete — 복구 불가. 실행 전 신중. (백업은 사용자 판단으로 생략)
-- ★ 이미 실행됨(운영 시작 전 1회). 보관은 이력용 — 다시 실행하면 운영 데이터가 전부 사라짐.
--
-- 비움: 출고 트랜잭션 + 품목 마스터 전부.
-- 보존: users(계정), access_logs(감사 로그).
--
-- RESTART IDENTITY: 모든 id 시퀀스 1부터 재시작(깨끗한 운영 시작).
--
-- FK 점검: invoices/items/upload_batches를 참조하는 모든 테이블
--   (invoice_items·scan_logs·invoice_reopens·item_aliases·invoices·upload_files)이
--   아래 목록에 전부 포함됨 → CASCADE 키워드 불필요, 누락 없음.
--   users/access_logs는 위 테이블들을 FK로 참조하지 않으므로 영향 없음(보존).
--
-- ★ 이 스크립트는 1회용. 운영 중 재실행 금지(데이터 날아감).
-- =====================================================

TRUNCATE
  scan_logs,
  invoice_items,
  invoice_reopens,
  invoices,
  upload_files,
  upload_batches,
  invoice_uploads,
  item_aliases,
  items
RESTART IDENTITY;
