-- 052: 품목 보관온도(상온/냉장/냉동) — 대시보드 출고수량 통계용
--   storage_type: 'room'(상온) | 'chilled'(냉장) | 'frozen'(냉동) | NULL(미지정)
-- 적용: Cloud SQL SQL Editor 에서 1회 실행 (idempotent).

ALTER TABLE items ADD COLUMN IF NOT EXISTS storage_type VARCHAR(10);
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_storage_type_check;
ALTER TABLE items ADD CONSTRAINT items_storage_type_check
  CHECK (storage_type IS NULL OR storage_type IN ('room', 'chilled', 'frozen'));

-- 초기값 (미지정 품목만 채움 — 이미 지정한 값은 건드리지 않음)
-- 냉장: 만월회 원액 베이스(스파우트·팩·샘플, 사양서 「냉장보관」), 콜드브루, 유제품 생크림·치즈·버터류
UPDATE items SET storage_type = 'chilled'
 WHERE storage_type IS NULL AND deleted_at IS NULL
   AND (category IN ('1kg', '500g', '샘플', '1팩', '4팩', '10팩', 'SET1팩', '커피')
        OR category LIKE '"소비기한임박"1kg' OR category LIKE '"소비기한임박"500g'
        OR (category IN ('유제품', '베이킹재료', '베이킹 재료')
            AND (kind ILIKE '%버터%' OR kind ILIKE '%크림치즈%' OR kind ILIKE '%마스카포네%' OR kind ILIKE '%휘핑크림%')));

-- 냉동: 베이커리(완제품·샘플), 빙수 토핑(브라우니·크림치즈너겟), 큐브형 치즈케이크, 모찌큐브
UPDATE items SET storage_type = 'frozen'
 WHERE storage_type IS NULL AND deleted_at IS NULL
   AND (category IN ('베이커리', '베이커리샘플')
        OR (category = '빙수' AND kind ILIKE '빙수토핑용%')
        OR (category = '토핑' AND (kind ILIKE '%치즈케이크%' OR kind ILIKE '모찌큐브%')));

-- 나머지 분류된 품목은 상온 (구분 없는 자동생성 품목은 미지정으로 둠)
UPDATE items SET storage_type = 'room'
 WHERE storage_type IS NULL AND deleted_at IS NULL
   AND category IS NOT NULL AND category <> '';
