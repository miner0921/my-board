-- =====================================================
-- 038. 송장 목록 keyset 페이지네이션 인덱스 — 세 탭 통일
-- =====================================================
-- 목적: 완료/대기/삭제 보기를 모두 keyset 페이지네이션으로 일반화할 때(3단계),
--       각 탭의 정렬·커서가 (정렬축, id) 복합 keyset이 된다. 인덱스도 거기에
--       정확히 맞춰 (정렬축 DESC, id DESC) 부분 인덱스로 '세 탭 동일 형식' 통일.
--
--   · 완료: (completed_at DESC, id DESC) WHERE 활성·완료
--   · 대기: (created_at   DESC, id DESC) WHERE 활성·대기
--   · 삭제: (deleted_at   DESC, id DESC) WHERE 삭제됨
--
-- 왜 복합(+id)인가: 036의 옛 인덱스는 (날짜) 단일키라, keyset 타이브레이크
--   (날짜, id) 와 정합이 아니었다. 특히 대기 탭은 같은 업로드 배치의
--   created_at 동률이 많아 id 타이브레이크가 실제로 중요 → 복합키가 정답.
--
-- ★ 누더기 방지: 옛 단일키 인덱스(036)는 반드시 DROP — 비슷한 인덱스 2개 방치 금지.
-- ★ 코드/데이터/검수 로직 변경 0. 인덱스만. 재실행 안전(IF NOT EXISTS / IF EXISTS).
--
-- 실행 위치: Cloud SQL(서울)에서 직접. 현재 데이터가 적어 일반 CREATE로 즉시 완료
--            (락은 순간). 데이터가 많아 길어질 땐 파일 하단 CONCURRENTLY 버전 사용.
--
-- ★ 만들고-나서-지우는 안전한 순서: 새 인덱스를 먼저 만들고, 생성을 확인한 뒤
--   옛 인덱스를 지운다. (새 이름이 옛 이름과 달라 동시 존재 가능 → 충돌 없음.)
-- =====================================================

-- ── (1) 새 인덱스 3개 생성 (통일 이름: idx_invoices_{tab}_keyset) ──────────

-- 완료 탭 — (completed_at DESC, id DESC), 활성·완료만
CREATE INDEX IF NOT EXISTS idx_invoices_completed_keyset
  ON invoices (completed_at DESC, id DESC)
  WHERE deleted_at IS NULL
    AND status IN ('completed', 'completed_partial');

-- 대기 탭 — (created_at DESC, id DESC), 활성·대기만
CREATE INDEX IF NOT EXISTS idx_invoices_pending_keyset
  ON invoices (created_at DESC, id DESC)
  WHERE deleted_at IS NULL
    AND status = 'pending';

-- 삭제 보기 — (deleted_at DESC, id DESC), 삭제된 것만 (신규 — 036에 없던 영역)
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_keyset
  ON invoices (deleted_at DESC, id DESC)
  WHERE deleted_at IS NOT NULL;

-- ── (2) 옛 단일키 인덱스 정리 (036) — 위 3개 생성 확인 후 실행 ───────────────
--   ※ 아래 확인쿼리로 새 3개가 보이는 것을 먼저 확인하고 DROP을 실행하세요.
DROP INDEX IF EXISTS idx_invoices_completed_active;
DROP INDEX IF EXISTS idx_invoices_pending_created;

-- =====================================================
-- [확인]
--   (a) invoices 인덱스 전체 — 새 3개 있고 옛 2개 사라졌는지:
--       SELECT indexname, indexdef FROM pg_indexes
--       WHERE tablename = 'invoices' ORDER BY indexname;
--       → idx_invoices_completed_keyset / _pending_keyset / _deleted_keyset 존재
--       → idx_invoices_completed_active / _pending_created 없음
--
--   (b) 중복/누더기 점검 — 같은 컬럼 조합의 비슷한 인덱스가 둘 이상 없는지 육안 확인.
--       (trgm 인덱스(037)·invoice_no UNIQUE 등은 용도가 달라 정상)
-- =====================================================

-- =====================================================
-- [운영 데이터가 많을 때 — CONCURRENTLY 무중단 버전]
--   일반 CREATE INDEX는 생성 동안 그 테이블의 '쓰기'를 잠근다(읽기는 가능).
--   지금은 데이터가 적어 순간이라 위 구문 그대로면 된다. 훗날 수십만 건이라
--   생성이 길어질 것 같으면, 위 (1)(2) 대신 아래를 '한 문장씩' 개별 실행한다.
--     · CONCURRENTLY는 트랜잭션 블록 안에서 실행 불가 → 줄 단위로 실행.
--     · 실패 시 INVALID 인덱스가 남을 수 있다(DROP 후 재시도). 확인:
--         SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--     · DROP도 CONCURRENTLY로: 새 3개 valid 확인 후 옛것 제거.
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_completed_keyset
--     ON invoices (completed_at DESC, id DESC)
--     WHERE deleted_at IS NULL AND status IN ('completed', 'completed_partial');
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_pending_keyset
--     ON invoices (created_at DESC, id DESC)
--     WHERE deleted_at IS NULL AND status = 'pending';
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_deleted_keyset
--     ON invoices (deleted_at DESC, id DESC)
--     WHERE deleted_at IS NOT NULL;
--
--   -- (위 3개 valid 확인 후)
--   DROP INDEX CONCURRENTLY IF EXISTS idx_invoices_completed_active;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_invoices_pending_created;
-- =====================================================
