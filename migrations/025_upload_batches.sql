-- =====================================================
-- 025. 업로드 묶음(발주서+송장 원본 보관) 테이블
-- =====================================================
-- 로컬/배포: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 실행
--
-- 한 행 = 한 묶음(발주서+송장). 발주서/송장 각 측 컬럼은 전부 nullable
-- (한쪽만 올라온 waiting 상태 허용). 파일 바이트는 BYTEA로 직접 보관
-- (items 이미지 패턴 재사용 — 무인프라, 트랜잭션 원자적).
--
-- status: waiting(한쪽만) / committed(둘 다 → 검수데이터 생성됨)
-- 1단계에선 confirm(두 파일 동시)이 곧바로 committed 행을 만든다.
-- waiting 생성(단일 파일 stash)은 2단계 과제.
--
-- 전부 신규/nullable → 기존 데이터 무영향, 백필 불필요.
-- 재실행 안전(IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS upload_batches (
  id SERIAL PRIMARY KEY,

  -- 발주서 (아직 안 올라왔으면 전부 NULL)
  order_file_data   BYTEA,
  order_filename    VARCHAR(255),
  order_mime        VARCHAR(100),
  order_uploaded_by INTEGER REFERENCES users(id),
  order_uploaded_at TIMESTAMP,

  -- 송장 (아직 안 올라왔으면 전부 NULL)
  invoice_file_data   BYTEA,
  invoice_filename    VARCHAR(255),
  invoice_mime        VARCHAR(100),
  invoice_uploaded_by INTEGER REFERENCES users(id),
  invoice_uploaded_at TIMESTAMP,

  -- 상태/메타
  status     VARCHAR(20) NOT NULL DEFAULT 'waiting',  -- waiting | committed
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upload_batches_status_created
  ON upload_batches(status, created_at DESC);
