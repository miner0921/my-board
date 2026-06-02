-- =====================================================
-- 011. invoices.completion_reason / completion_note 추가
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- Phase 5-C 결품 완료 기록.
--   - 재고 부족, 고객 취소, 파손 등의 사유로 송장 전체를 다 못 챙기고
--     일부만 출고하는 경우를 "결품 완료(partial)"로 기록.
--   - status 컬럼은 그대로 유지하되 'completed_partial' 값을 새로 사용.
--     'pending' → 'completed' (정상 완료) 또는 'completed_partial' (결품 완료)
--
-- completion_reason 값:
--   'full'            : 모두 챙김 (자동 완료) - 보통 NULL로 두고 'completed' 상태로만 판단
--   'out_of_stock'    : 재고 부족
--   'customer_cancel' : 고객 취소
--   'damaged'         : 파손
--   'other'           : 기타
--
-- completion_note: 결품 완료 시 작업자 메모 (10자 이상 필수).
--
-- 기존 완료된 송장은 모두 NULL → 정상 완료(full) 로 간주.
-- 재실행 안전.
-- =====================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS completion_reason VARCHAR(20);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS completion_note TEXT;
