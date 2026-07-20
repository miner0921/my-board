-- =====================================================
-- 047. items(활성 508행) → variants 복사 + 옵션 파싱 + 별칭 생성
-- =====================================================
-- 로컬 개발: pgAdmin/psql 에서 warehouse DB 선택 후 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 1회 실행
-- 선행: 045_new_tables.sql (variants 테이블), 046_org_and_users.sql (MANWOL supplier)
--
-- ⭐ id 보존이 절대 원칙 ⭐
--   items.id 를 variants.id 로 그대로 넣는다.
--   invoice_items.item_id (2417행)가 이 id 를 가리키고 있어서,
--   id 가 어긋나면 기존 송장-품목 매핑이 전부 깨진다.
--
-- items 원본은 절대 건드리지 않는다 — 이 파일에서 items 는 SELECT 만 한다.
--
-- [예상 처리 행수]
--   1) variants INSERT : 508행  (A갈래 181 + C갈래 327)
--   2) item_aliases INSERT : 181행  (A갈래만 — 파싱으로 이름이 바뀐 행)
--   3) setval : 1회
--
-- [파싱 규칙] — scripts/opt1-split-simulation.sql 로 사전 검증 완료
--   (검증 결과: A 181 / B 0 / C 327, 새 match_name 중복 0건)
--
--   옵션목록 = ('1kg','500g','4팩','1팩','SET1팩','10팩',
--              '샘플','베이커리샘플','추가','이벤트','세트')
--
--   A. category 가 옵션목록에 있고 name 이 '('||category||')' 로 시작:
--        opt1_value = category
--        품명       = btrim(replace(name, '('||category||')', ''))
--        match_name = 품명 || opt1_value      (구분자 없음 — 문서 4장 스펙)
--   C. 그 외:
--        opt1_value = NULL
--        match_name = name (그대로)
--
--   ※ replace() 는 전체 치환이지만, A 조건이 '접두 일치'라 안전하다.
--     실데이터 181행 전부 replace 결과 = substr 결과로 일치함을 확인했다.
--
-- [동봉물 4행] id 244/463/466/467 — (파트너스스티커동봉)/(주문서동봉)/
--   (명세서동봉)/(거래명세서동봉). category 가 '' 라 옵션목록 밖 → C갈래.
--   match_name = name 그대로, 별칭도 안 만든다.
--   track_stock=false 처리는 products 에 있는 개념이고 지금은 product_id=NULL 이라
--   variants 에는 해당 컬럼이 없다 → 나중에 product 로 묶을 때 처리. 지금은 넘어간다.
--
-- [sku_code] items.product_code 를 넣되, 유일할 때만.
--   · NULL 40행           → NULL 그대로
--   · 중복 코드 14개×2=28행 → 전부 NULL (어느 쪽이 진짜인지 알 수 없으므로)
--   · 나머지 440행        → product_code 그대로
--   (최대 길이 9자 확인 — variants.sku_code VARCHAR(20) 에 들어감)
--
-- 재실행 안전: variants INSERT 는 WHERE NOT EXISTS(id) 로, 별칭은
--   ON CONFLICT DO NOTHING 으로 막는다.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 1) items → variants 복사 (예상 508행)
-- -----------------------------------------------------
INSERT INTO variants (
  id, product_id, supplier_id, sku_code,
  opt1_value, opt2_value, match_name,
  pack_size, box_max, deleted_at, created_at
)
SELECT
  i.id,                                              -- id 보존 (절대 원칙)
  NULL,                                              -- product_id: 전부 NULL. 나중에 사람이 묶는다
  (SELECT id FROM suppliers WHERE code = 'MANWOL'),  -- supplier_id
  -- sku_code: 활성행 안에서 유일한 product_code 만 승계
  CASE
    WHEN i.product_code IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM items d
       WHERE d.deleted_at IS NULL
         AND d.product_code = i.product_code
         AND d.id <> i.id
    ) THEN NULL
    ELSE i.product_code
  END,
  -- opt1_value: A갈래만 category, C갈래는 NULL
  CASE
    WHEN i.category IN ('1kg','500g','4팩','1팩','SET1팩','10팩',
                        '샘플','베이커리샘플','추가','이벤트','세트')
     AND i.name LIKE '(' || i.category || ')%'
    THEN i.category
  END,
  NULL,                                              -- opt2_value
  -- match_name: A갈래는 품명||opt1, C갈래는 name 그대로
  CASE
    WHEN i.category IN ('1kg','500g','4팩','1팩','SET1팩','10팩',
                        '샘플','베이커리샘플','추가','이벤트','세트')
     AND i.name LIKE '(' || i.category || ')%'
    THEN btrim(replace(i.name, '(' || i.category || ')', '')) || i.category
    ELSE i.name
  END,
  NULL,                                              -- pack_size
  NULL,                                              -- box_max
  NULL,                                              -- deleted_at (활성행만 복사)
  COALESCE(i.created_at, NOW())                      -- created_at 보존
FROM items i
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = i.id);   -- 재실행 안전

-- -----------------------------------------------------
-- 2) 별칭 생성 — A갈래만 (예상 181행)
--    발주서에 옛 이름('(1kg)우베')으로 와도 새 match_name('우베1kg')에
--    매칭되도록 원본 items.name 을 별칭으로 남긴다.
--    C갈래는 match_name = name 이라 자기 자신 → 만들지 않는다.
--
--    item_aliases 구조 (023):
--      item_id / alias_name / normalized_alias(UNIQUE) / created_by / created_at
--    · item_id FK 는 아직 items(id) 를 가리킨다(048에서 variants 로 개명 예정).
--      id 가 같으므로 지금 넣는 값은 어느 쪽 기준으로도 유효하다.
--    · normalized_alias = normalizeProductName(alias_name)
--      = trim + 연속공백 1칸 (lib/normalize-product.ts 규칙 그대로).
--      items.name 은 이미 정규화형이라 사실상 동일하지만 명시적으로 적용한다.
--    · 사전 확인: A갈래 181개 원본 name 은 서로 중복 없고,
--      다른 활성행 name 과도 충돌 없음 → UNIQUE(normalized_alias) 안전.
-- -----------------------------------------------------
INSERT INTO item_aliases (item_id, alias_name, normalized_alias, created_by, created_at)
SELECT
  i.id,
  i.name,
  btrim(regexp_replace(i.name, '\s+', ' ', 'g')),
  NULL,                                              -- created_by: 마이그레이션이므로 없음
  NOW()
FROM items i
WHERE i.deleted_at IS NULL
  AND i.category IN ('1kg','500g','4팩','1팩','SET1팩','10팩',
                     '샘플','베이커리샘플','추가','이벤트','세트')
  AND i.name LIKE '(' || i.category || ')%'
ON CONFLICT (normalized_alias) DO NOTHING;           -- 재실행 안전

-- -----------------------------------------------------
-- 3) variants 시퀀스 재설정
--    id 를 명시 삽입했으므로 다음 nextval 이 MAX(id)+1 이 되도록 맞춘다.
--    (안 하면 신규 variant INSERT 가 PK 충돌로 실패한다)
-- -----------------------------------------------------
SELECT setval(
  pg_get_serial_sequence('variants', 'id'),
  (SELECT MAX(id) FROM variants),
  TRUE
);

COMMIT;

-- =====================================================
-- [검증]
--   -- 행수: 508 / 181
--   SELECT count(*) FROM variants;
--   SELECT count(*) FROM item_aliases;
--
--   -- id 보존 확인: items 활성 ↔ variants 가 1:1, 차집합 0
--   SELECT count(*) FROM items i WHERE i.deleted_at IS NULL
--     AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = i.id);   -- 0
--   SELECT count(*) FROM variants v
--     WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = v.id);    -- 0
--
--   -- invoice_items 가 가리키는 item_id 가 전부 variants 에 있는지
--   SELECT count(DISTINCT ii.item_id) FROM invoice_items ii
--     WHERE NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = ii.item_id);
--     -- 0 이 아니면 soft delete 된 items 를 가리키는 매핑이 있다는 뜻 → 확인 필요
--
--   -- 파싱 결과 샘플
--   SELECT id, sku_code, opt1_value, match_name FROM variants
--    WHERE opt1_value IS NOT NULL ORDER BY id LIMIT 20;
--
--   -- opt1 있는 행수 = 181
--   SELECT count(*) FROM variants WHERE opt1_value IS NOT NULL;
--
--   -- match_name 중복 0 (051 UNIQUE 부착 전 사전 확인)
--   SELECT match_name, count(*) FROM variants
--    WHERE deleted_at IS NULL GROUP BY match_name HAVING count(*) > 1;
--
--   -- sku_code 채워진 행수 = 440 (508 - NULL 40 - 중복 28)
--   SELECT count(*) FROM variants WHERE sku_code IS NOT NULL;
--
--   -- 시퀀스 확인
--   SELECT last_value FROM variants_id_seq;   -- = MAX(variants.id)
-- =====================================================
