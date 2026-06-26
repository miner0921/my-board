-- =====================================================
-- 039. 자동생성 품목의 빈 구분(category)/종류(kind) 보정
-- =====================================================
-- 배경: 발주서 자동생성 품목(is_auto_created=TRUE)은 과거 name만 채우고
--       category/kind는 NULL로 저장됐다(commit-upload). 그래서 수정 화면은
--       name 역산(splitProductName)으로 "구분"을 보여주지만, 카테고리 필터는
--       category 컬럼 distinct만 보므로 그 값이 선택지에 안 떴다.
--       → 앞으로는 commit-upload가 채우도록 코드 수정(같은 규칙). 이 파일은
--         '기존 데이터'를 같은 규칙으로 한 번 보정한다.
--
-- 규칙(= lib/product-name.ts splitProductName 과 동일):
--   "(구분)종류" 형태 = 정규식 ^\([^)]+\).+ (괄호 + 괄호 안 내용 + 괄호 뒤 종류).
--     · category = 괄호 안   = substring(name from '^\(([^)]+)\)')
--     · kind     = 괄호 뒤   = substring(name from '^\([^)]+\)(.+)$')
--   괄호만((주문서동봉) 등)·괄호없음은 분리 불가 → 보정 대상 아님(그대로 NULL).
--
-- ★ 안전선:
--   · name·barcode·product_code·quantity 절대 안 건드린다. category/kind만 SET.
--   · 매칭 키(name) 불변 → 검수/매칭/수량 영향 0(점검 완료).
--   · 재실행 안전: category 빈 행만 대상(WHERE) → 이미 채운 건 건드리지 않음.
--
-- 실행: Cloud SQL(서울)에서 직접. 먼저 (1) 미리보기 SELECT로 대상/결과를 확인하고
--       (2) UPDATE를 실행한다.
-- =====================================================

-- ── (1) 보정 전 미리보기 — 대상 행과 채워질 값 확인 (UPDATE 전에 실행) ──────────
-- SELECT
--   id,
--   name,
--   category AS cur_category,
--   kind     AS cur_kind,
--   substring(name from '^\(([^)]+)\)')  AS new_category,
--   substring(name from '^\([^)]+\)(.+)$') AS new_kind
-- FROM items
-- WHERE is_auto_created = TRUE
--   AND deleted_at IS NULL
--   AND (category IS NULL OR category = '')
--   AND name ~ '^\([^)]+\).+'
-- ORDER BY id;

-- ── (2) 보정 UPDATE — category/kind 만 SET (name 등 절대 불변) ────────────────
UPDATE items
SET category = substring(name from '^\(([^)]+)\)'),
    kind     = substring(name from '^\([^)]+\)(.+)$'),
    updated_at = CURRENT_TIMESTAMP
WHERE is_auto_created = TRUE
  AND deleted_at IS NULL
  AND (category IS NULL OR category = '')
  AND name ~ '^\([^)]+\).+';

-- ── (3) 검증 — 보정 후 남은 빈 category 자동생성 품목 (괄호만/괄호없음만 남아야) ──
-- SELECT id, name, category, kind
-- FROM items
-- WHERE is_auto_created = TRUE AND deleted_at IS NULL
--   AND (category IS NULL OR category = '')
-- ORDER BY id;
-- =====================================================
