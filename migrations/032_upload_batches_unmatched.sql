-- =====================================================
-- 032. upload_batches 발주서-only 집계 (발주서에만 있는 건)
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- ★ 반드시 025_upload_batches.sql 실행 후에 (그 테이블에 컬럼 추가).
--
-- 목적: 매칭 시 "발주서에만 있고 송장 없음"인 건은 invoices에 안 들어가므로,
--   그 건수(+선택적으로 주문번호 목록)를 등록 단위(batch)에 기록해 목록/상세에서 표시.
--   값은 등록 시 이미 계산되는 onlyInOrder 결과를 "기록만"(매칭 로직 불변).
--
-- count는 NOT NULL DEFAULT 0(기존 행도 0), nos는 nullable.
-- 기존 데이터 무영향. 재실행 안전(IF NOT EXISTS).
-- =====================================================

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS unmatched_order_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS unmatched_order_nos TEXT[];
