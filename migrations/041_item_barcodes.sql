-- =====================================================
-- 041. 다중 바코드 — item_barcodes (품목 1:N 추가 바코드)
-- =====================================================
-- 설계:
--   · items.barcode = "대표 바코드" 로 그대로 유지(표시·필터·정렬·배지 현행).
--   · 추가 바코드는 이 테이블에 별도 행으로. 스캔 시 대표+추가 어느 것이든
--     해당 품목으로 인식된다(app/api/warehouse/scan/route.ts).
--   · 별칭(item_aliases, 023)과 같은 "보조 키" 패턴이지만, 별칭은 품명 매칭이고
--     이 테이블은 바코드 매칭이다.
--
-- UNIQUE 범위(중요):
--   · UNIQUE(item_id, barcode) — "같은 품목 안에서만" 바코드 중복 금지.
--   · 품목 '간' 같은 바코드 공유는 016 그대로 허용한다. 실서버에 (샘플)↔(1팩) 등
--     의도된 동일 바코드 19쌍이 있으므로 barcode 단독 UNIQUE 를 걸면 안 된다.
--   · 따라서 barcode 인덱스는 스캔 조회 가속용 '비유니크' 인덱스다.
--
-- 백필 없음:
--   · items.barcode 는 대표로 남으므로 이관하지 않는다. 이 테이블은 처음엔 비어 있다.
--
-- 실행 위치:
--   · 로컬 개발: pgAdmin/psql 에서 boarddb(또는 warehouse) 선택 후 실행.
--   · 실서버: GCP Cloud SQL(서울) Studio 또는 psql 에서 1회 실행.
--   · 재실행 안전(IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS item_barcodes (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  barcode VARCHAR(100) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_id, barcode)      -- 같은 품목 내 중복만 금지(품목 간 공유는 허용)
);

-- 품목별 추가 바코드 조회용(수정 모달·목록 +N·GET 동봉)
CREATE INDEX IF NOT EXISTS idx_item_barcodes_item ON item_barcodes(item_id);

-- 스캔 시 바코드 → 품목 역조회 가속(비유니크 — 품목 간 중복 허용이므로).
CREATE INDEX IF NOT EXISTS idx_item_barcodes_barcode ON item_barcodes(barcode);

-- =====================================================
-- [검증]
--   SELECT * FROM item_barcodes;                     -- 처음엔 0건(백필 없음)
--   \d item_barcodes                                 -- UNIQUE(item_id, barcode) 확인
--   SELECT indexname FROM pg_indexes
--     WHERE tablename = 'item_barcodes';             -- idx 2개 + unique 확인
-- =====================================================
