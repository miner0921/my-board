-- =====================================================
-- 048. item_id → variant_id 개명 + FK 대상 items → variants 교체
-- =====================================================
-- 로컬 개발: pgAdmin/psql 에서 warehouse DB 선택 후 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 1회 실행
-- 선행: 047_migrate_variants.sql (variants 508행이 채워져 있어야 함)
--
-- 컬럼 rename 이라 데이터는 한 행도 움직이지 않는다. 바뀌는 건 컬럼명과 FK 대상뿐.
-- 047 의 id 보존 원칙 덕분에 기존 item_id 값이 그대로 variants.id 로 유효하다.
-- (047 검증: invoice_items 가 가리키는 고유 item_id 311개 전부 활성 items 안에 있고,
--  고아 참조 0건 — 따라서 새 FK 부착 시 위반이 발생하지 않는다.)
--
-- [사전 확인한 실제 제약 이름] — pg_constraint 조회 결과
--   invoice_items_item_id_fkey  : FOREIGN KEY (item_id) REFERENCES items(id)
--   item_barcodes_item_id_fkey  : FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
--   item_aliases_item_id_fkey   : FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
--   → ON DELETE 동작은 기존 그대로 유지해서 다시 붙인다.
--
-- [행수] invoice_items 2435 / item_aliases 181 / item_barcodes 5
--
-- [item_barcodes.supplier_id] 현재 없음 → 이 파일에서 추가하고 MANWOL 로 채운다.
--   · 비정규화 컬럼(문서 예정 사항). 조회 시 variants 조인 없이 업체 필터 하려는 용도.
--   · NOT NULL 로 걸지 않는다 — 앱의 바코드 등록 코드
--     (app/api/warehouse/items/[id]/barcodes/route.ts)가 아직 이 컬럼을 안 넣기 때문.
--     앱 수정 후 별도 파일에서 NOT NULL 승격을 검토한다.
--
-- ⚠️ [범위 밖 — 그대로 둔다] scan_logs.item_id
--   scan_logs_item_id_fkey : FOREIGN KEY (item_id) REFERENCES items(id)
--   items(id) 를 참조하는 FK 는 총 4개인데 이번 개명 대상은 3개다.
--   따라서 이 파일 실행 후 scan_logs 만 items 를 계속 가리킨다(의도된 상태).
--   지시 범위에 없어 건드리지 않았다 — 나중에 정리할지 결정 필요.
--
-- ⚠️ [rename 후 이름이 안 맞게 되는 것들] 동작에는 영향 없음, 이름만 헷갈림.
--   · UNIQUE 제약/인덱스 (정의는 자동으로 variant_id 로 따라가지만 '이름'은 그대로)
--       invoice_items_invoice_id_item_id_key   → 실제 정의: UNIQUE (invoice_id, variant_id)
--       item_barcodes_item_id_barcode_key      → 실제 정의: UNIQUE (variant_id, barcode)
--   · 일반 인덱스 (이름에 item 이 들어감)
--       idx_item_aliases_item   ON item_aliases(item_id → variant_id)
--       idx_item_barcodes_item  ON item_barcodes(item_id → variant_id)
--   이름 변경은 이 파일에 넣지 않았다(지시 범위 밖). 필요하면 별도 파일에서
--   ALTER ... RENAME CONSTRAINT / ALTER INDEX ... RENAME TO 로 정리.
--
-- ⚠️ [앱 코드] 26개 파일 185군데가 item_id 를 참조한다(SQL 컬럼명 + JS 프로퍼티명 혼재).
--   이 파일을 실행하면 SQL 에서 item_id 를 쓰는 서버 코드가 전부 깨진다.
--   목록은 마이그레이션 실행 보고에 별도로 정리했다. 코드 수정은 나중 단계.
--   → 로컬에서 검증 목적으로만 실행하고, 앱 수정 전까지는 배포하지 말 것.
--
-- 재실행 안전: DROP CONSTRAINT IF EXISTS / ADD COLUMN IF NOT EXISTS,
--   rename 은 DO 블록으로 컬럼 존재 여부를 확인한 뒤 수행.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- A. invoice_items (2435행 — 검수의 핵심. 가장 조심)
-- -----------------------------------------------------
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_item_id_fkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'invoice_items' AND column_name = 'item_id') THEN
    ALTER TABLE invoice_items RENAME COLUMN item_id TO variant_id;
  END IF;
END $$;

-- 원래 ON DELETE 옵션 없음(RESTRICT) → 그대로
ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES variants(id);

-- -----------------------------------------------------
-- B. item_barcodes (5행) + supplier_id 비정규화 컬럼
-- -----------------------------------------------------
ALTER TABLE item_barcodes DROP CONSTRAINT IF EXISTS item_barcodes_item_id_fkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'item_barcodes' AND column_name = 'item_id') THEN
    ALTER TABLE item_barcodes RENAME COLUMN item_id TO variant_id;
  END IF;
END $$;

-- 원래 ON DELETE CASCADE → 그대로 유지
ALTER TABLE item_barcodes
  ADD CONSTRAINT item_barcodes_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE;

-- 비정규화 supplier_id 추가 후 MANWOL 로 채움 (5행)
ALTER TABLE item_barcodes
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);

UPDATE item_barcodes
   SET supplier_id = (SELECT id FROM suppliers WHERE code = 'MANWOL')
 WHERE supplier_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_item_barcodes_supplier
  ON item_barcodes(supplier_id);

-- -----------------------------------------------------
-- C. item_aliases (181행 — 047에서 만든 별칭)
-- -----------------------------------------------------
ALTER TABLE item_aliases DROP CONSTRAINT IF EXISTS item_aliases_item_id_fkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'item_aliases' AND column_name = 'item_id') THEN
    ALTER TABLE item_aliases RENAME COLUMN item_id TO variant_id;
  END IF;
END $$;

-- 원래 ON DELETE CASCADE → 그대로 유지
ALTER TABLE item_aliases
  ADD CONSTRAINT item_aliases_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE;

COMMIT;

-- =====================================================
-- [검증]
--   -- 1) 컬럼명이 variant_id 로 바뀌었는지 (3행)
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE column_name = 'variant_id'
--      AND table_name IN ('invoice_items','item_barcodes','item_aliases');
--
--   -- 2) item_id 가 남아있는 테이블 → scan_logs 만 나와야 정상
--   SELECT table_name FROM information_schema.columns
--    WHERE column_name = 'item_id' AND table_schema = 'public';
--
--   -- 3) FK 가 variants 를 가리키는지 + ON DELETE 유지 확인
--   SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE contype = 'f' AND confrelid = 'variants'::regclass ORDER BY 1;
--     -- invoice_items_variant_id_fkey  (옵션 없음)
--     -- item_barcodes_variant_id_fkey  (ON DELETE CASCADE)
--     -- item_aliases_variant_id_fkey   (ON DELETE CASCADE)
--
--   -- 4) items 를 아직 참조하는 FK → scan_logs_item_id_fkey 1개만
--   SELECT conrelid::regclass::text, conname FROM pg_constraint
--    WHERE contype = 'f' AND confrelid = 'items'::regclass;
--
--   -- 5) 행수 불변 확인: 2435 / 5 / 181
--   SELECT (SELECT count(*) FROM invoice_items), (SELECT count(*) FROM item_barcodes),
--          (SELECT count(*) FROM item_aliases);
--
--   -- 6) 고아 참조 0 (FK 가 보장하지만 재확인)
--   SELECT count(*) FROM invoice_items ii
--    WHERE NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = ii.variant_id);   -- 0
--
--   -- 7) item_barcodes.supplier_id 전부 채워졌는지
--   SELECT count(*) FROM item_barcodes WHERE supplier_id IS NULL;              -- 0
-- =====================================================
