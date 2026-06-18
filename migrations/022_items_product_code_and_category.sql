-- 022: 품목에 품목코드 / 구분(category) / 종류(kind) 컬럼 추가
--
-- 새 SKU 마스터 엑셀 양식(품목코드/바코드/구분/종류) 도입에 따른 스키마 확장.
--   - product_code: 덮어쓰기(upsert) 판단 기준. 같은 코드면 갱신, 없으면 신규.
--   - category(구분) + kind(종류): 의미 단위 원본 저장 (통계/검색/내보내기용).
--   - name(품명)은 그대로 유지. 검수 매칭(confirm/scan)은 계속 name 기준이라 무수정.
--     쓰기 시 name = "(구분)종류" 로 조합해 함께 기록(앱: composeProductName).
--
-- 송장 업로드로 자동생성되는 품목은 product_code/category/kind 가 NULL(분해값 없음) —
-- name 만 채워지며 검수에는 영향 없음. 통계/필터에서는 "미분류"로 취급.
--
-- 적용: Neon/Cloud SQL SQL Editor 에서 1회 실행 (idempotent).

ALTER TABLE items ADD COLUMN IF NOT EXISTS product_code VARCHAR(100);
ALTER TABLE items ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE items ADD COLUMN IF NOT EXISTS kind VARCHAR(200);

-- 덮어쓰기 대상 조회 / 카테고리 필터 성능용 인덱스.
-- (016에서 바코드 UNIQUE를 푼 정책과 동일하게 UNIQUE 제약은 두지 않고
--  앱 레벨 upsert 로직으로 일관 처리.)
CREATE INDEX IF NOT EXISTS idx_items_product_code ON items(product_code);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
