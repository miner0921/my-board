-- =====================================================
-- 050. 이관 완료 후 UNIQUE 제약·인덱스 부착 (문서 6장 제약 목록)
-- =====================================================
-- 로컬 개발: pgAdmin/psql 에서 warehouse DB 선택 후 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 1회 실행
-- 선행: 045(테이블) / 047(variants 508행). 048 에는 의존하지 않는다.
--
-- 제약 번호는 문서 6장 목록을 따른다. 3번(item_barcodes)은 아래 사유로 제외했다.
--
-- =====================================================
-- [제외] 제약3  item_barcodes (supplier_id, barcode) — 걸지 않는다
-- =====================================================
--   같은 바코드가 여러 variant 에 붙는 것이 '정상 정책'이기 때문이다.
--     · 제조사 바코드 공유
--     · 낱개 / 1팩 처럼 같은 바코드에 다른 SKU
--   UNIQUE(supplier_id, barcode)는 이 정책과 정면으로 충돌한다.
--   (041 의 설계 노트 — "품목 간 같은 바코드 공유 허용" — 와도 같은 결론.
--    참고로 활성 items 중 대표 바코드를 공유하는 그룹이 27개 있다.)
--   item_barcodes 의 기존 UNIQUE(item_id, barcode) = "같은 품목 안에서만 중복 금지"
--   는 그대로 유지된다. 그게 올바른 범위다.
--
-- =====================================================
-- [사전검사 결과] 로컬 warehouse DB 실측 — 전부 위반 0
-- =====================================================
--   제약1  variants (supplier_id, match_name)
--     SELECT supplier_id, match_name, count(*) FROM variants
--      GROUP BY 1,2 HAVING count(*) > 1;                        → 0행 ✅
--     match_name NULL/빈값                                      → 0행 ✅
--     (match_name 은 NOT NULL 컬럼이라 구조적으로도 안전)
--
--   제약2  variants (supplier_id, sku_code)
--     SELECT count(*) FILTER (WHERE sku_code IS NULL), count(sku_code) FROM variants;
--       → NULL 68 / 값 있음 440 / 합 508
--     SELECT supplier_id, sku_code, count(*) FROM variants
--      WHERE sku_code IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;  → 0행 ✅
--     ★ Postgres UNIQUE 는 NULL 을 서로 다른 값으로 취급하므로
--       68개 NULL 은 충돌하지 않는다. 값 있는 440행만 유일성 검사 대상.
--
--   제약4  stock_movements (ref_type, ref_id, seq)            → 0행(빈 테이블) ✅
--   제약5  stock_lots COALESCE 유니크 인덱스                   → 0행(빈 테이블) ✅
--
--   기존 UNIQUE 확인: variants 에는 variants_pkey(PRIMARY KEY (id)) 뿐,
--     UNIQUE 제약 없음 — 045 에서 안 걸었다는 전제대로다 ✅
--
-- =====================================================
-- [보류한 판단] 제약1·2의 부분 인덱스 전환
-- =====================================================
--   제약1/2는 deleted_at 을 보지 않는 '통짜' UNIQUE 다. soft delete 된 variant 도
--   이름·코드 슬롯을 계속 점유한다.
--   지금은 variants.deleted_at 이 전부 NULL 이라 무영향이므로 통짜로 둔다.
--   "삭제한 품목의 이름·코드를 재사용" 이 필요해지는 시점에
--   부분 인덱스(CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL)로 전환한다.
--
-- 제약 부착이 실패하면 어느 것 때문인지 바로 알 수 있도록 하나씩 이름을 명시했다.
-- 재실행 안전: 제약은 DO 블록으로 존재 여부 확인 후 부착, 인덱스는 IF NOT EXISTS.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 제약 1. variants: UNIQUE (supplier_id, match_name)
--   검수 매칭 키. 한 업체 안에서 같은 매칭 품명이 둘일 수 없다.
--   사전검사: 중복 0행 (508행 전수)
-- -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'variants_supplier_id_match_name_key') THEN
    ALTER TABLE variants
      ADD CONSTRAINT variants_supplier_id_match_name_key
      UNIQUE (supplier_id, match_name);
  END IF;
END $$;

-- -----------------------------------------------------
-- 제약 2. variants: UNIQUE (supplier_id, sku_code)
--   품목코드. NULL 68행은 UNIQUE 대상 밖(Postgres NULL 다중 허용).
--   사전검사: 값 있는 440행 중 중복 0행
-- -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'variants_supplier_id_sku_code_key') THEN
    ALTER TABLE variants
      ADD CONSTRAINT variants_supplier_id_sku_code_key
      UNIQUE (supplier_id, sku_code);
  END IF;
END $$;

-- -----------------------------------------------------
-- 제약 3. (제외 — 상단 주석 참고)
--   item_barcodes UNIQUE(supplier_id, barcode) 는 걸지 않는다.
--   같은 바코드의 다중 variant 공유가 정상 정책이기 때문.
-- -----------------------------------------------------

-- -----------------------------------------------------
-- 제약 4. stock_movements: UNIQUE (ref_type, ref_id, seq)
--   같은 원인(ref) 안에서 순번 중복 방지 = 중복 적재 방어.
--   빈 테이블(0행)이라 위반 불가.
-- -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'stock_movements_ref_type_ref_id_seq_key') THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_ref_type_ref_id_seq_key
      UNIQUE (ref_type, ref_id, seq);
  END IF;
END $$;

-- -----------------------------------------------------
-- 제약 5. stock_lots: COALESCE 기반 UNIQUE 인덱스
--   같은 variant + 같은 (유통기한, 제조일) 조합의 로트는 하나만.
--   날짜가 NULL 이면 UNIQUE 가 무력해지므로 센티널 값으로 치환해 비교한다.
--     expiry_date NULL → '9999-12-31'  (무기한 취급)
--     mfg_date    NULL → '1900-01-01'
--   빈 테이블(0행)이라 위반 불가.
-- -----------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_lots_variant_dates
  ON stock_lots (
    variant_id,
    COALESCE(expiry_date, DATE '9999-12-31'),
    COALESCE(mfg_date,    DATE '1900-01-01')
  );

COMMIT;

-- =====================================================
-- [검증]
--   -- 부착된 제약 3개 확인
--   SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname IN ('variants_supplier_id_match_name_key',
--                      'variants_supplier_id_sku_code_key',
--                      'stock_movements_ref_type_ref_id_seq_key')
--    ORDER BY 1;                                    -- 3행
--
--   SELECT indexdef FROM pg_indexes
--    WHERE indexname = 'uq_stock_lots_variant_dates';   -- 1행
--
--   -- item_barcodes 에 supplier_id 기반 UNIQUE 가 '없어야' 정상
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'item_barcodes'::regclass AND contype = 'u';
--     -- item_barcodes_item_id_barcode_key 만 나와야 함
--
--   -- 행수 불변 확인 (제약 부착은 데이터를 안 건드림)
--   SELECT count(*) FROM variants;                  -- 508
--
--   -- NULL sku_code 가 여전히 68행 그대로인지 (UNIQUE 가 NULL 을 안 막는지 확인)
--   SELECT count(*) FROM variants WHERE sku_code IS NULL;   -- 68
-- =====================================================
