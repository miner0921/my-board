-- =====================================================
-- 006. 송장 확장 (Phase 4-A-1)
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 발주서/송장 엑셀 업로드를 받기 위해 invoices와 invoice_items에 컬럼 추가.
-- 모든 신규 컬럼은 nullable (자동 파싱 실패 행도 일단 등록 후 사용자 확인 용도).
-- 기존 데이터에 영향 없음. 재실행 안전 (IF NOT EXISTS).
-- =====================================================

-- invoices 확장
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recipient_name        VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recipient_phone       VARCHAR(30);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recipient_address     TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recipient_postal_code VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_note         TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_no              VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS raw_product_name      TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sender_name           VARCHAR(100);

-- invoice_items 확장: 정규화 전 원본 상품명 보존 (송장 화면 표시용)
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS display_name VARCHAR(300);

-- 인덱스: 주문번호로 매칭/검색 빈번 (UNIQUE 아님 - "/1","/2" 분할 송장 가능)
CREATE INDEX IF NOT EXISTS idx_invoices_order_no ON invoices(order_no);
