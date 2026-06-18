-- 024: 송장 관리자 메모(admin_memo) + 재개 수동/자동 구분(is_manual)
--
-- [E] 관리자 메모: 관리자가 송장에 남기는 안내(처리 지시 등). 작업자는 스캔 화면에서 보기만.
--   - invoices.admin_memo (TEXT, NULL=메모 없음). 입력/수정은 앱 API에서 requireAdmin.
--
-- [A] 재개 사유 표시: invoice_reopens.reason 은 이미 있으나 자동 재개도 같은 컬럼에
--   고정 문구('…자동 재개')를 써서, 스캔 화면엔 "수동(관리자) 재개 사유"만 보여야 한다.
--   - is_manual: 수동 재개(invoices/[id]/reopen, 관리자) 행만 true. 자동 재개는 false(기본).
--   - 스캔 표시: 최신 is_manual=true 행의 reason.
--   - (데이터 정리 직후라 기존 재개행 없음 → 백필 불필요.)
--
-- 적용: Neon/Cloud SQL SQL Editor 에서 1회 실행 (idempotent).

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS admin_memo TEXT;

ALTER TABLE invoice_reopens
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;
