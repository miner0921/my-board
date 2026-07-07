-- =====================================================
-- 043. 완료 탭 인덱스에 수동완료(manual_completed) 포함
-- =====================================================
-- 배경: 완료 탭 목록/필터 쿼리가 status IN ('completed','completed_partial',
--       'manual_completed') 로 확장된다. 그런데 완료 탭 핵심 인덱스
--       idx_invoices_completed_keyset(038) 의 부분 술어는
--       status IN ('completed','completed_partial') 뿐이라, manual_completed 를
--       포함한 쿼리는 "쿼리 조건 ⊆ 인덱스 술어" 증명이 안 돼 인덱스를 못 쓴다
--       → Seq Scan + Sort 로 전락(수십만 건에서 폭주). 이를 막기 위해 술어에
--       manual_completed 를 추가한다.
--
--   현재 술어: deleted_at IS NULL AND status IN ('completed','completed_partial')
--   목표 술어: deleted_at IS NULL AND status IN ('completed','completed_partial','manual_completed')
--   컬럼 구성(completed_at DESC, id DESC)은 그대로 — keyset 정렬축 불변.
--
-- ★ 인덱스만 교체한다 — 데이터/스키마/검수 로직 변경 0.
--
-- 부분 인덱스의 술어(WHERE)는 ALTER 로 못 바꾼다 → DROP + CREATE 필수.
--
-- 실행 위치: Cloud SQL(서울)에서 직접. 수십만 건 전제라 '무중단'으로 한다
--            (일반 CREATE INDEX 는 생성 동안 테이블 쓰기를 잠근다 → CONCURRENTLY 사용).
--
-- ─────────────────────────────────────────────────────────────
-- ★ 실행 방법: CONCURRENTLY 는 트랜잭션 블록 안에서 실행 불가.
--   이 파일을 통째로(BEGIN/COMMIT) 감싸지 말고, 아래 문장을 '한 줄씩' 개별 실행한다.
--
-- ★ 무중단 순서: (1) 새 인덱스를 새 이름으로 먼저 만들고 → (2) 구 인덱스를 지우고
--   → (3) 새 인덱스를 원래 이름으로 RENAME. 신규 생성 먼저 → 구 삭제 순서라,
--   재생성 동안 완료 탭이 인덱스 없이 Seq Scan 되는 공백이 생기지 않는다.
--
-- ─────────────────────────────────────────────────────────────
-- ⚠️ CONCURRENTLY 실패 시 INVALID(무효) 인덱스가 남을 수 있다. 실행 전/후 점검:
--     SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--   → 위 쿼리에 무효 인덱스(예: idx_invoices_completed_keyset_v2)가 잡히면
--     DROP INDEX CONCURRENTLY IF EXISTS <그 인덱스명>; 로 지우고 해당 CREATE 를 재시도.
-- =====================================================


-- (1) 새 인덱스 생성 — 새 이름(_v2), 3값 술어. ★ 한 줄씩 실행 ★
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_completed_keyset_v2
  ON invoices (completed_at DESC, id DESC)
  WHERE deleted_at IS NULL
    AND status IN ('completed', 'completed_partial', 'manual_completed');

-- ── 여기서 새 인덱스가 valid 인지 확인한 뒤 (2)로 진행 ──
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--   → idx_invoices_completed_keyset_v2 가 목록에 '없어야' 정상(= valid).


-- (2) 구 인덱스 삭제 — 038 이 만든 2값 술어 인덱스. ★ 한 줄씩 실행 ★
DROP INDEX CONCURRENTLY IF EXISTS idx_invoices_completed_keyset;


-- (3) 새 인덱스를 원래 이름으로 RENAME (메타데이터만 변경, 즉시·락 순간). ★ 한 줄씩 실행 ★
ALTER INDEX idx_invoices_completed_keyset_v2
  RENAME TO idx_invoices_completed_keyset;


-- =====================================================
-- [확인] 교체가 끝났는지 육안 점검:
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'invoices'
--      AND indexname = 'idx_invoices_completed_keyset';
--   → indexdef 의 WHERE 에 'manual_completed' 가 포함되어야 정상.
--   → idx_invoices_completed_keyset_v2 는 (RENAME 되어) 더는 존재하지 않아야 한다.
-- =====================================================
