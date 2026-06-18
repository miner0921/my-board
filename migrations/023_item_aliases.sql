-- 023: 품목 별칭(같은 취급 품명) 테이블
--
-- 별칭 = "또 다른 정규화 품명이 같은 품목 id를 가리키는 것".
--   새 매칭 방식이 아니라, 매칭 인덱스(lib/resolve-item.ts buildItemIndex)에 행을
--   추가하는 개념. 송장에 품목별 특이 변형이 와도 그 품목으로 매칭되게 한다.
--   예: 품목 "(1kg)말차"에 별칭 "말차1키로" → 송장 "말차1키로"도 그 품목으로.
--
-- 적용 범위: 송장 매칭(confirm/preview)에만. 대량등록 upsert는 품목 name 기준
--   (별칭으로 마스터 품명이 오염되지 않도록 제외).
--
-- normalized_alias = itemMatchKey(alias_name)(= normalizeProductName) — 매칭 키.
--   UNIQUE(normalized_alias)로 "한 별칭이 두 품목을 가리키는" 모순을 차단.
--   (품목 name 과의 충돌은 앱 레벨에서 등록 시 하드 블록.)
--
-- 권한: 등록/삭제는 관리자만(앱 API requireAdmin).
-- 적용: Neon/Cloud SQL SQL Editor 에서 1회 실행 (idempotent).

CREATE TABLE IF NOT EXISTS item_aliases (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alias_name VARCHAR(200) NOT NULL,        -- 입력 원본(표시용)
  normalized_alias VARCHAR(200) NOT NULL,  -- itemMatchKey(alias_name) — 매칭 키
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_item_aliases_item ON item_aliases(item_id);
