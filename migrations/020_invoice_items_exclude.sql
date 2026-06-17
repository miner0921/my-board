-- =====================================================
-- 020. 검수 중 품목 제외(exclude) — 송장에서 품목 빼기
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — Cloud SQL Studio 또는 psql에서 실행
--
-- 검수 중 "이 박스에서 이 품목은 빼자"를 표현한다.
-- 완전삭제가 아니라 "제외 표시"(soft delete, 019 패턴 미러링):
--   - excluded_at IS NULL → 정상 품목(진행률/완료 판정에 포함)
--   - excluded_at 값 있음  → 제외됨 (진행률/완료 판정에서 빠짐)
--   - scanned_count / scan_logs 는 그대로 보존 → 이미 챙긴 기록 안 지워짐
--   - 복구 = excluded_at/excluded_by/exclude_reason 를 NULL 로 (송장 상세에서)
--
-- 누가(excluded_by)·언제(excluded_at)·왜(exclude_reason, 선택) 행에 기록.
-- 추가로 scan_logs 에 error_reason='item_excluded'(is_error=false) 한 줄 남겨 추적.
--
-- 기존 행은 전부 NULL(=정상). 재실행 안전.
-- =====================================================

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS excluded_at    TIMESTAMP;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS excluded_by    INTEGER REFERENCES users(id);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS exclude_reason VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_invoice_items_excluded_at ON invoice_items(excluded_at);
