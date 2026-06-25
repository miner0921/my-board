-- =====================================================
-- 036. 송장 목록(완료/대기 탭) 정렬·필터 인덱스 (성능)
-- =====================================================
-- 목적: invoices가 수만~수십만 건으로 누적될 때, 송장 목록의
--       "ORDER BY 날짜 + status/deleted 필터"가 Seq Scan + Sort로
--       느려지는 것을 막는다.
--
-- ★ 인덱스만 추가한다 — 데이터/스키마/검수 로직 변경 0.
--   재실행 안전(IF NOT EXISTS). 기존 인덱스 손대지 않음.
--
-- 실행 위치: Cloud SQL(서울)에서 직접. 현재 데이터가 적어 즉시 완료된다
--            (CREATE INDEX의 쓰기 잠금은 순간). 데이터가 많을 때를 대비한
--            CONCURRENTLY 안내는 파일 하단 주석 참고.
--
-- 대상 쿼리 (app/warehouse/invoices/page.tsx):
--   완료 탭: WHERE i.deleted_at IS NULL
--             AND i.status IN ('completed','completed_partial')
--             AND i.completed_at IS NOT NULL
--           ORDER BY i.completed_at DESC NULLS LAST
--   대기 탭: WHERE i.deleted_at IS NULL
--             AND i.status = 'pending'
--           ORDER BY i.created_at DESC NULLS LAST
-- =====================================================

-- (1) ★ 완료 탭 — 핵심 인덱스 ----------------------------------------
--   완료 송장은 한번 쌓이면 빠지지 않고 무한 누적되는 '유일한' 목록 →
--   유일하게 폭주 위험이 있는 쿼리라 1순위.
--
--   왜 '부분(partial) 인덱스'인가:
--     · WHERE의 deleted_at IS NULL + status IN(...) 를 인덱스 조건으로 박아,
--       활성·완료 행만 담는다 → 인덱스가 작고(=캐시 적중↑) 스캔이 빠르다.
--     · 인덱스 키가 completed_at DESC NULLS LAST 로 ORDER BY와 '완전 일치'
--       → 정렬(Sort) 단계 자체가 사라진다(가장 큰 비용 제거).
--     · 날짜범위 필터(from/to)도 completed_at 기준이라 같은 인덱스의
--       범위 스캔으로 처리된다.
--     · 추후 페이지네이션(LIMIT)을 붙이면, 인덱스 순서대로 LIMIT개만 읽고
--       즉시 멈춘다 → 전체 건수와 무관한 일정 응답시간(최대 효과).
CREATE INDEX IF NOT EXISTS idx_invoices_completed_active
  ON invoices (completed_at DESC NULLS LAST)
  WHERE deleted_at IS NULL
    AND status IN ('completed', 'completed_partial');

-- (2) 대기 탭 — 보조 인덱스 ------------------------------------------
--   대기 송장은 완료되면 목록에서 빠져 자연 상한이 있어 우선순위는 낮다.
--   다만 'status = pending' 부분 인덱스는 대기 행만 담아 매우 작고
--   쓰기 부담이 미미하므로, 정렬 일관성을 위해 함께 둔다.
CREATE INDEX IF NOT EXISTS idx_invoices_pending_created
  ON invoices (created_at DESC NULLS LAST)
  WHERE deleted_at IS NULL
    AND status = 'pending';

-- =====================================================
-- [추가하지 않은 것 — 근거]
--   · idx_invoices_status (status 단일 컬럼): status는 값이 3~4종뿐이라
--     선택도가 낮아 플래너가 거의 안 쓴다. 위 두 부분 인덱스가 status를
--     이미 조건으로 품고 있어 중복 → 쓰기 비용만 늘어 제외.
--   · idx_invoices_created_at / completed_at (전체 단일 컬럼): 위 부분
--     인덱스가 상위 호환(필터까지 내장)이라 불필요. 단일 컬럼판이 더
--     필요해지는 경우는 'deleted/status 무관하게 날짜로만 정렬'하는
--     새 화면이 생길 때 — 지금 목록 쿼리엔 해당 없음.
--   · invoice_items 조인(GROUP BY 집계): 이미 idx_invoice_items_invoice
--     (001)가 있어 추가 인덱스 불필요.
-- =====================================================

-- =====================================================
-- [운영 데이터가 많을 때 — CONCURRENTLY 옵션]
--   일반 CREATE INDEX는 그 테이블의 '쓰기'를 인덱스 생성 동안 잠근다
--   (읽기는 가능). 지금은 데이터가 적어 순식간이라 위 구문 그대로면 된다.
--
--   훗날 invoices가 수십만 건이라 생성이 길어질 것 같으면, 잠금 없이
--   만드는 아래 CONCURRENTLY 버전을 대신 쓴다. 단:
--     · 트랜잭션 블록 안에서 실행 불가(각 문장을 개별 실행).
--     · 일반보다 느리고, 실패 시 INVALID 인덱스가 남을 수 있어
--       (DROP 후 재시도) 확인이 필요.
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_completed_active
--     ON invoices (completed_at DESC NULLS LAST)
--     WHERE deleted_at IS NULL
--       AND status IN ('completed', 'completed_partial');
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_pending_created
--     ON invoices (created_at DESC NULLS LAST)
--     WHERE deleted_at IS NULL
--       AND status = 'pending';
-- =====================================================
