-- =====================================================
-- 046. 조직 초기행(tpls/suppliers) + users 스코프 컬럼
-- =====================================================
-- 로컬 개발: pgAdmin/psql 에서 warehouse DB 선택 후 실행
-- 배포 시: Cloud SQL(서울) — psql 또는 Cloud SQL Studio에서 1회 실행
-- 선행: 045_new_tables.sql (tpls/suppliers 테이블이 있어야 함)
--
-- 하는 일:
--   1) tpls 초기행 1건    — 더블에스로지스(SSLOGIS)
--   2) suppliers 초기행 1건 — 만월상회(MANWOL), 소속 3PL = 더블에스로지스
--   3) users 에 스코프 컬럼 3개 추가 (tpl_id / supplier_id / user_code)
--   4) 기존 users 3행에 스코프 값 배치
--
-- ⭐ role 은 건드리지 않는다 ⭐
--   · 기존 값(admin / user)을 그대로 둔다. UPDATE 없음.
--   · 015의 CHECK 제약(users_role_check: role IN ('user','admin'))도 그대로 둔다.
--   · 따라서 이 파일은 현재 로그인·권한 로직(requireAdmin, proxy.ts 등)에
--     아무 영향이 없다 — 컬럼만 늘어난다.
--
--   스코프 판단은 role '이름'이 아니라 tpl_id / supplier_id '컬럼'으로 한다.
--     · tpl_id·supplier_id 둘 다 NULL → 전체 조회
--     · tpl_id 만       → 해당 3PL 산하 전체
--     · supplier_id 만  → 해당 업체만
--   role 이름 정리(superadmin/tpl/supplier)와 화면 분기·액션 권한은
--   나중 단계에서 lib/scope.ts 와 함께 일괄 처리한다.
--   (문서 7장: 스코프는 지금, 권한은 나중)
--
-- code 정책:
--   · 앞으로 생성되는 3PL/업체 코드는 난수 발급이 원칙이지만,
--     기존 계정·기존 업체인 이 2건만 예외로 고정 코드('SSLOGIS'/'MANWOL')를 쓴다.
--
-- 만월상회 '업체 계정'(업체 소속 유저)은 이 파일에서 만들지 않는다.
--   · 업체 계정은 나중에 3PL이 직접 발급한다.
--   · 지금 필요한 건 suppliers 행 하나뿐 — 기존 508개 item 이 이 supplier_id 를
--     가리켜야 하므로(이관은 별도 파일에서).
--
-- 재실행 안전: INSERT 는 WHERE NOT EXISTS (code 에 UNIQUE 가 아직 없음),
--              ADD COLUMN 은 IF NOT EXISTS, UPDATE 는 멱등.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 1) 3PL 초기행 — 더블에스로지스
-- -----------------------------------------------------
INSERT INTO tpls (code, name, is_active)
SELECT 'SSLOGIS', '더블에스로지스', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tpls WHERE code = 'SSLOGIS');

-- -----------------------------------------------------
-- 2) 업체 초기행 — 만월상회 (소속 3PL = 더블에스로지스)
-- -----------------------------------------------------
INSERT INTO suppliers (tpl_id, code, name, is_active)
SELECT (SELECT id FROM tpls WHERE code = 'SSLOGIS'), 'MANWOL', '만월상회', TRUE
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE code = 'MANWOL');

-- -----------------------------------------------------
-- 3) users 스코프 컬럼 추가
--    셋 다 nullable — 위 주석의 NULL 조합이 곧 스코프 범위다.
--    role 컬럼은 손대지 않는다.
-- -----------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS tpl_id INTEGER REFERENCES tpls(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code VARCHAR(20);

-- -----------------------------------------------------
-- 4) 기존 users 3행 스코프 배치 (role 은 제외 — 기존 값 유지)
--    id 를 직접 쓰지 않고 username 과 code 서브쿼리로 지정.
-- -----------------------------------------------------

-- admin → 스코프 없음(전체 조회). role 은 'admin' 그대로.
UPDATE users
   SET tpl_id      = NULL,
       supplier_id = NULL,
       user_code   = NULL
 WHERE username = 'admin';

-- sslogis → 더블에스로지스 소속. role 은 'user' 그대로.
UPDATE users
   SET tpl_id      = (SELECT id FROM tpls WHERE code = 'SSLOGIS'),
       supplier_id = NULL,
       user_code   = 'SSLOGIS-01'
 WHERE username = 'sslogis';

-- test → 더블에스로지스 소속. role 은 'user' 그대로.
UPDATE users
   SET tpl_id      = (SELECT id FROM tpls WHERE code = 'SSLOGIS'),
       supplier_id = NULL,
       user_code   = 'SSLOGIS-02'
 WHERE username = 'test';

COMMIT;

-- =====================================================
-- [검증]
--   SELECT id, code, name, is_active FROM tpls;
--     -- 1행: SSLOGIS / 더블에스로지스
--
--   SELECT s.id, s.code, s.name, t.code AS tpl_code
--     FROM suppliers s LEFT JOIN tpls t ON t.id = s.tpl_id;
--     -- 1행: MANWOL / 만월상회 / SSLOGIS
--
--   SELECT id, username, role, tpl_id, supplier_id, user_code
--     FROM users ORDER BY id;
--     -- 1 admin   admin  NULL  NULL  NULL
--     -- 2 sslogis user   1     NULL  SSLOGIS-01
--     -- 3 test    user   1     NULL  SSLOGIS-02
--     -- role 이 admin/user 그대로인지 반드시 확인
-- =====================================================
