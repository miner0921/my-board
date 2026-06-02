-- =====================================================
-- 012. invoice_reopens 테이블 (완료된 송장 재개 이력)
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- Phase 5-D 검수 재개 기능.
--   - 완료(completed) 또는 결품 완료(completed_partial) 상태의 송장을
--     배송 전 변경 요청 등으로 다시 'pending'으로 되돌릴 때 사용.
--   - 재개 직전 상태(prev_*)를 그대로 캡처해 두어 감사/추적 가능.
--   - reason은 사용자 입력 사유(10자 이상 — 애플리케이션 레벨 검증).
--
-- 보존 정책:
--   - invoices.scan_started_at / scan_started_by : 보존 (최초 시작 시점 의미)
--   - invoice_items.scanned_count / is_added_on_scan : 보존 (이어서 검수)
--   - invoices.status / completed_at / completed_by /
--     completion_reason / completion_note : NULL로 초기화
--   → 이전 값은 모두 invoice_reopens.prev_* 에 보관.
--
-- 재실행 안전 (IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_reopens (
  id BIGSERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  reopened_by INTEGER REFERENCES users(id),
  reason TEXT NOT NULL,
  reopened_at TIMESTAMP DEFAULT NOW(),
  prev_status VARCHAR(30),
  prev_completion_reason VARCHAR(20),
  prev_completion_note TEXT,
  prev_completed_at TIMESTAMP,
  prev_completed_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_reopens_invoice
  ON invoice_reopens(invoice_id);
