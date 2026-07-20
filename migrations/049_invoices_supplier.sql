-- =====================================================
-- 049. invoices 에 supplier_id 추가 + 기존 전 행 MANWOL 로 채움
-- =====================================================
-- 로컬 개발: pgAdmin/psql 에서 warehouse DB 선택 후 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 1회 실행
-- 선행: 046_org_and_users.sql (MANWOL supplier 행이 있어야 함)
--
-- 목적: 스코프 필터(어느 업체의 송장인가)의 기반.
--   지금은 단일 업체라 기존 송장 전부가 만월회(MANWOL)다.
--
-- [예상 처리 행수] invoices 전체 1032행이 채워진다.
--   · 활성(deleted_at IS NULL)     899행
--   · soft delete 된 행            133행
--   soft delete 된 송장도 함께 채운다 — 이력 조회/복구 시에도 스코프가 필요하므로
--   (WHERE 절에 deleted_at 조건을 두지 않는 이유).
--
-- ⚠️ NOT NULL 을 걸지 않는다
--   앱의 송장 생성 코드가 아직 이 컬럼을 넣지 않아서, NOT NULL 이면 신규 INSERT 가
--   즉시 깨진다. 048 의 item_barcodes.supplier_id 와 같은 이유.
--   앱이 supplier_id 를 채우도록 고친 뒤 별도 파일에서 NOT NULL 승격을 검토한다.
--
-- 이 파일은 '컬럼 추가'뿐이라 기존 코드에 무손상 — 로컬 앱은 그대로 작동한다.
-- (048 과 달리 컬럼 rename 이 없다. 기존 SELECT/INSERT 는 영향 없음.)
--
-- 재실행 안전: ADD COLUMN IF NOT EXISTS / UPDATE 는 IS NULL 조건이라 멱등 /
--   CREATE INDEX IF NOT EXISTS.
-- =====================================================

BEGIN;

-- 1) 컬럼 추가 (nullable — 위 주석 참고)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);

-- 2) 기존 전 행을 MANWOL 로 채움 (예상 1032행: 활성 899 + soft delete 133)
UPDATE invoices
   SET supplier_id = (SELECT id FROM suppliers WHERE code = 'MANWOL')
 WHERE supplier_id IS NULL;

-- 3) 스코프 필터 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);

COMMIT;

-- =====================================================
-- [검증]
--   -- 1) 전 행이 채워졌는지 → 0 이어야 함
--   SELECT count(*) FROM invoices WHERE supplier_id IS NULL;
--
--   -- 2) 행수 대조: total 1032 = manwol 1032, NULL 0
--   SELECT
--     count(*) AS total,
--     count(*) FILTER (WHERE supplier_id IS NOT NULL) AS filled,
--     count(*) FILTER (WHERE deleted_at IS NULL) AS active,
--     count(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted
--   FROM invoices;
--
--   -- 3) 전부 만월회 한 곳인지
--   SELECT s.code, s.name, count(*) FROM invoices i
--     JOIN suppliers s ON s.id = i.supplier_id
--    GROUP BY s.code, s.name;      -- MANWOL / 만월회 / 1032
--
--   -- 4) 컬럼이 nullable 인지 확인 (NOT NULL 이면 안 됨)
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'invoices' AND column_name = 'supplier_id';   -- YES
-- =====================================================
