---
name: security-audit
description: OWASP Top 10:2021 기반 시큐어 코딩 가이드 + git diff 적대적 보안 감사(보안 게이트). 두 용도 — (1) 기능 구현 중 시큐어 코딩 가이드, (2) 구현/수정 완료 후 커밋·배포 전 보안 게이트로 변경분을 OWASP Top 10 기준 적대적으로 감사. "보안 감사", "보안 점검", "secure coding", "OWASP", "취약점 점검", "커밋 전 보안 게이트", "배포 전 보안 검토" 요청 시 사용. CRITICAL이 1개라도 있으면 FAIL 판정하는 보고서를 낸다.
allowed-tools: Read, Glob, Grep, Bash, Edit
---

# Security Audit — OWASP Top 10:2021

이 스킬은 **방어를 증명하려 하지 않는다. 공격을 가정한다.**

> **핵심 원칙**
> 모든 외부 입력(쿼리스트링·바디·헤더·쿠키·params·업로드 파일·DB에 저장된 사용자 데이터)은 **적대적**이다.
> 클라이언트(브라우저·모바일·스캐너·확장프로그램·curl)는 **신뢰할 수 없다.**
> UI에서 버튼을 숨기거나 disabled 처리한 것은 보안이 아니다. **보안은 오직 서버에서 강제된다.**
> "공격자라면 이 줄을 어떻게 악용할까?"를 먼저 묻고, 그 다음에 방어를 확인한다.

이 프로젝트 기준(감사 시 앵커로 사용):
- 인증: NextAuth v5 — `const session = await auth()` (`@/auth`). 인증 필요 라우트는 `session?.user?.id` 없으면 401.
- 권한: **미들웨어 + 페이지 + API 삼중 방어**. 본인이 등록한 자원만 수정/삭제(`created_by`), 단 `items.is_auto_created=TRUE`는 공용 수정 허용. 일부 동작은 `requireAdmin`.
- DB: `lib/db.ts`의 `query(text, params)` / `withTransaction` — **parameterized($1) 전용**. Neon/Cloud SQL.
- Next.js 15: `params`는 Promise (`const { id } = await params`). DB `id`(number) vs `session.user.id`(string)는 `String()` 변환 비교.
- 시크릿: `DATABASE_URL`, `AUTH_SECRET` 등은 환경변수(`.env*`, `.env.deploy.local`) — 코드/로그/커밋 금지.
- 파일시스템 쓰기 금지(Cloud Run) — 업로드 이미지는 DB BYTEA. 업로드 검증은 `lib/upload.ts`.

---

## 모드 1 — 시큐어 코딩 가이드 (구현 중)

새 라우트/기능을 짤 때 코드를 쓰기 **전·중**에 적용한다. 아래 체크리스트의 "완화"를 기본값으로 삼아 작성한다. 특히:

1. **모든 라우트 핸들러 첫 줄**: `auth()`로 인증 확인 → 없으면 401. 그 다음 **자원 소유권/권한을 서버에서 재조회해 확인**(클라이언트가 보낸 `user_id`·`role`·`is_admin` 절대 신뢰 금지).
2. **모든 DB 접근**: `query(sql, [params])` parameterized. 사용자 입력을 SQL/식별자/ORDER BY에 문자열로 끼우지 않는다.
3. **모든 입력**: 타입·범위·길이·허용값(allowlist)을 서버에서 검증. `Number()`/`parseInt` 결과 `NaN`·음수·과대값 차단.
4. **출력/응답**: 필요한 필드만. 비밀번호 해시·내부 ID·스택트레이스·다른 사용자 데이터 누출 금지.
5. **에러**: 사용자에겐 친화적 한국어 일반 메시지, 상세는 서버 로그에만. 예외로 인증 우회되지 않게 `try/catch`로 fail-closed.

의심스러우면 **deny-by-default**: 명시적으로 허용된 것만 통과시킨다.

---

## 모드 2 — 보안 게이트 (구현/수정 완료 후, 커밋·배포 전)

변경분을 OWASP Top 10 기준으로 **적대적으로** 감사하고 **보고서**를 낸다.

### 감사 절차

1. **변경 범위 수집**
   ```bash
   git diff --stat HEAD
   git diff HEAD            # 워킹트리 변경
   # 이미 커밋된 경우: git diff <base>..HEAD 또는 git show <sha>
   ```
   신규/수정된 **서버 코드**(`app/api/**`, `app/**/page.tsx`의 server action, `lib/**`, `proxy.ts`, `auth*.ts`, `middleware`)와 DB 쿼리, 입력 처리, 인증/권한 분기를 우선 본다.

2. **각 변경 hunk마다 10개 카테고리를 순회**하며 "공격자라면?"을 적용. 아래 체크리스트의 **탐지 패턴**으로 grep/Read.

3. **확신 검증(false positive 회피)**: 의심 지점마다 *실제로 방어가 없는지* 코드를 따라가 확인. 이미 `auth()`·소유권 재조회·parameterized·검증이 있으면 **보고하지 않는다**(필요 시 VERIFIED로만 기록). 추측으로 CRITICAL을 달지 않는다 — 악용 경로를 구체적으로 적을 수 있을 때만 CRITICAL.

4. **보고서 출력**(아래 형식). CRITICAL ≥ 1 → **FAIL**.

빠른 1차 그렙(시작점, 결과는 반드시 코드로 확증):
```bash
# parameterized 위반 의심 — 문자열 연결/템플릿이 SQL에 들어가나
git diff HEAD | grep -nE "query\(|\\$\{.*\}|' \+|\" \+|`.*SELECT|`.*INSERT|`.*UPDATE|`.*DELETE"
# 인증/권한 분기
git diff HEAD | grep -nE "auth\(\)|session|requireAdmin|created_by|is_admin|role|user_id"
# 하드코딩 시크릿 의심
git diff HEAD | grep -niE "password\s*=|secret|api[_-]?key|token\s*=|AUTH_SECRET|postgres://|postgresql://"
# 위험 sink
git diff HEAD | grep -nE "dangerouslySetInnerHTML|eval\(|child_process|exec\(|fetch\(|new Function|redirect\("
```

---

## OWASP Top 10:2021 체크리스트

각 항목: **공격 가정 → 탐지 → 완화 → 이 프로젝트 기준**. CRITICAL 후보는 ⛔ 표시.

### A01 — Broken Access Control (가장 흔함)
- **공격 가정**: 인증된 사용자가 `id`를 바꿔 **남의 자원**을 읽기/수정/삭제(IDOR). 비관리자가 관리자 엔드포인트 직접 호출. 클라이언트가 보낸 `role`/`user_id`/`is_admin`을 서버가 그대로 믿음. 미들웨어/페이지만 막고 API는 안 막음.
- **탐지**:
  - 라우트가 `auth()` 확인 없이 동작하는가? ⛔
  - `params.id`/바디의 자원 id로 조회·변경하면서 **소유권(`created_by = session.user.id`)을 서버에서 재확인하지 않는가?** ⛔ (IDOR)
  - 권한을 **클라이언트 입력**(`body.role`, `body.user_id`, `body.is_admin`)으로 판단하는가? ⛔
  - 관리자 동작에 `requireAdmin`(서버 세션 기반)이 빠졌는가? ⛔
  - "UI에서 버튼 숨김"만 있고 서버 강제가 없는가?
- **완화**: 라우트 진입 시 `auth()` → 자원은 **DB에서 소유자/권한을 다시 조회해** 세션 사용자와 대조. deny-by-default. id 비교는 `String(row.created_by) === session.user.id`. 관리자 경로는 세션의 역할만 신뢰.
- **이 프로젝트**: 삼중 방어 유지하되 **API가 최종 방어선**. `is_auto_created=TRUE` 공용 수정 예외는 의도된 정책 — 그 외엔 본인 자원만.

### A02 — Cryptographic Failures
- **공격 가정**: 비밀번호 평문/약한 해시 저장, 시크릿 노출, 평문 전송, 민감정보 응답/로그 누출.
- **탐지**:
  - 비밀번호를 `bcrypt.hash` 없이 저장/비교하는가? ⛔
  - 응답·로그·에러에 비밀번호 해시·세션토큰·`DATABASE_URL`·`AUTH_SECRET`이 섞이는가? ⛔
  - 시크릿이 코드에 하드코딩됐는가? ⛔ (A05와 겹침)
  - 자체 암호화 롤(자작 crypto)?
- **완화**: bcrypt로 해시·비교. 시크릿은 환경변수만. SELECT에서 `password` 컬럼을 불필요하게 가져오지 않음. 로그 마스킹.
- **이 프로젝트**: 이미지 조회 쿼리는 BYTEA를 SELECT 안 하고 `has_image`만(누출·성능). 비밀번호는 `bcrypt`.

### A03 — Injection (SQLi/XSS/Command/etc.)
- **공격 가정**: 입력으로 SQL 구조 변경(`' OR 1=1--`), `dangerouslySetInnerHTML`로 저장형 XSS, 셸 명령 주입.
- **탐지**:
  - SQL에 **문자열 연결/템플릿 리터럴**로 사용자 입력이 들어가는가? ⛔ (`` `... WHERE name='${q}'` ``, `"... " + id`)
  - 동적 식별자(테이블/컬럼/`ORDER BY ${col}`)를 입력으로 만드는가? ⛔ → allowlist로만.
  - `dangerouslySetInnerHTML`, `eval`, `new Function`, `child_process`/`exec`에 입력이 닿는가? ⛔
  - 검색 `LIKE`에 `%` 와일드카드/특수문자 미이스케이프(부분 위험).
- **완화**: **항상 parameterized `$1`**, 값만 바인딩. 식별자·정렬 컬럼은 서버 allowlist 매핑. React는 기본 이스케이프 — `dangerouslySetInnerHTML` 회피, 불가피하면 sanitize. 셸 호출 회피.
- **이 프로젝트**: `lib/db.ts query(text, params)` 외 raw 쿼리 금지. 문자열 SQL 발견 즉시 CRITICAL.

### A04 — Insecure Design
- **공격 가정**: 검증을 클라이언트에만 둠, 비즈니스 규칙(수량·가격·상태전이·권한 경계)이 서버에서 강제 안 됨, 레이트리밋 부재로 무차별 대입.
- **탐지**:
  - 클라이언트가 보낸 값(가격·합계·상태·완료여부)을 서버가 **재계산/재검증 없이** 신뢰하는가? ⛔
  - 상태 전이(예: 송장 완료/재개, 수량)가 서버 불변식 없이 클라 주도인가?
  - 로그인/민감 동작에 시도 제한이 없는가?
- **완화**: 신뢰 경계를 서버에 둔다. 합계·진행률·완료판정은 **서버에서 계산**(클라 표시는 참고용). 상태 전이는 서버에서 조건 검사. 민감 동작 레이트리밋/락 고려.
- **이 프로젝트**: 진행률·완료판정은 서버 집계(`excluded_at IS NULL` 등)로 산출 — 클라 `items`로 재계산 안 함. 이 모델 유지.

### A05 — Security Misconfiguration
- **공격 가정**: 디버그/스택트레이스 노출, 기본 시크릿, 과한 CORS, 위험 헤더, 하드코딩 시크릿, 프로덕션에 켜진 dev 플래그.
- **탐지**:
  - **시크릿 하드코딩** (`const SECRET="..."`, 커넥션 문자열, API 키)? ⛔
  - 에러 응답에 스택트레이스/내부 경로/SQL 원문 노출? ⛔
  - `Access-Control-Allow-Origin: *` + 인증쿠키 동반? ⛔
  - `.env*`가 커밋/도커 이미지에 포함될 위험? (`.gitignore`/`.dockerignore`/`.gcloudignore` 확인)
  - `console.log`로 민감정보/디버그 잔존(CLAUDE.md: 작업 후 제거)?
- **완화**: 시크릿은 env. 에러는 일반 메시지+서버 로그. CORS 최소. `.env.deploy.local`은 3중 ignore 유지. 디버그 로그 제거.
- **이 프로젝트**: `.env*` gitignore + `.dockerignore`/`.gcloudignore` 제외 확인. 응답은 `NextResponse.json`으로 통제.

### A06 — Vulnerable and Outdated Components
- **공격 가정**: 알려진 CVE 가진 의존성, 방치된 패키지.
- **탐지**:
  - `package.json`에 새 의존성 추가됐는가? 핀 버전·신뢰성 확인. (CLAUDE.md: 새 패키지 사전 알림)
  - `npm audit` 고위험 존재?
  - 유지보수 안 되는/오타 스쿼팅 의심 패키지?
- **완화**: 필요한 의존성만. `npm audit` 확인. 메이저 보안 패치 추적.
- **이 프로젝트**: next/next-auth/pg/bcryptjs 등 핵심만. 추가 시 보고.

### A07 — Identification and Authentication Failures
- **공격 가정**: 세션 미검증 엔드포인트, 약한 세션/쿠키, 무차별 로그인, 사용자 열거(에러 메시지로 계정 존재 노출), 로그아웃/만료 미흡.
- **탐지**:
  - 보호돼야 할 라우트가 `auth()` 없이 응답? ⛔
  - 로그인 실패 메시지가 "없는 계정" vs "비번 틀림"을 구분해 **열거 허용**?
  - 비밀번호 정책/해시 부재? 세션 쿠키 `httpOnly`/`secure`/`sameSite` 설정?
  - `session.user.id` 신뢰만 하고 만료/유효성 미확인?
- **완화**: 모든 보호 라우트 `auth()`. 로그인 실패는 **동일한 일반 메시지**. NextAuth 쿠키 기본 보안속성 유지. 비밀번호 bcrypt.
- **이 프로젝트**: `auth.ts`/`auth.config.ts` 공용 — 변경 시 영향범위 확인. 인증은 미들웨어+API 동시.

### A08 — Software and Data Integrity Failures
- **공격 가정**: 신뢰 못 할 역직렬화, 클라이언트가 보낸 객체를 검증 없이 DB에 그대로 저장(mass assignment), 무결성 검증 없는 외부 코드/CI.
- **탐지**:
  - 요청 바디를 통째로 `INSERT/UPDATE`에 펼치는가(`...body`)? ⛔ (mass assignment — `created_by`/`role`/`is_admin` 덮어쓰기)
  - 클라가 보낸 `id`/`created_by`/타임스탬프/상태를 그대로 신뢰?
  - 서명/검증 없는 동적 코드 로드?
- **완화**: **필드 allowlist**로 명시적 매핑만 저장. `created_by`는 항상 `session.user.id`로 서버가 설정. 클라가 보낸 권한/소유 필드 무시.
- **이 프로젝트**: INSERT 시 소유자·생성시각은 서버가 채움. 바디는 화이트리스트 컬럼만.

### A09 — Security Logging and Monitoring Failures
- **공격 가정**: 보안 이벤트(인증 실패, 권한 위반, 관리자 동작) 미기록 → 침해 탐지 불가. 반대로 **로그에 민감정보 과다** 기록.
- **탐지**:
  - 권한 위반·관리자 동작·인증 실패가 감사 로그에 남는가? (`logAccess`/`scan_logs` 등)
  - 로그에 비밀번호·토큰·전체 PII가 들어가는가? ⛔ (과다 로깅도 위험)
- **완화**: 보안 관련 동작은 감사 기록(누가/언제/무엇). 로그엔 식별자만, 민감값 마스킹.
- **이 프로젝트**: `lib/audit.ts logAccess`, `scan_logs` 패턴 활용. 디버그 `console.log`는 제거.

### A10 — Server-Side Request Forgery (SSRF)
- **공격 가정**: 서버가 **사용자가 준 URL/호스트**로 요청 → 내부망(`169.254.169.254` 메타데이터, `localhost`, Cloud SQL, 사설망) 접근/스캔.
- **탐지**:
  - 서버 코드가 입력 URL로 `fetch`/HTTP 요청을 보내는가? ⛔ (사용자 제어 호스트면)
  - 이미지/웹훅/리다이렉트 대상이 입력으로 정해지는가? (open redirect 포함)
  - 외부 리소스 프록시·미리보기 기능?
- **완화**: 외부로 나가는 요청의 호스트를 **allowlist**로 제한. 사설/링크로컬/메타데이터 IP 차단. 리다이렉트 대상은 내부 경로 allowlist만.
- **이 프로젝트**: 현재 서버발 외부 fetch는 거의 없음 — **새로 생기면 즉시 SSRF 검토**. 클라이언트 fetch(브라우저발)는 SSRF 아님.

---

## 기본 보안 규칙 (위반 시 최소 WARNING, 악용 경로 있으면 CRITICAL)
1. **SQL은 parameterized `$1` 강제.** 문자열 연결/템플릿 리터럴로 SQL 구성 금지. 동적 식별자/정렬은 allowlist.
2. **시크릿 하드코딩 금지.** 시크릿·커넥션 문자열·키는 환경변수만. 커밋/로그/응답에 노출 금지.
3. **클라이언트 입력으로 권한/소유 판단 금지.** `created_by`·역할은 서버 세션/DB로만.
4. **fail-closed.** 예외/미검증 경로는 거부. 의심스러우면 deny-by-default.

---

## 출력 형식 — 보안 감사 보고서

> 등급 정의
> - **🔴 CRITICAL**: 악용 경로를 구체적으로 적을 수 있는 실제 취약점(IDOR, SQLi, 인증 우회, 시크릿 노출, mass assignment, SSRF 등). **1개라도 있으면 FAIL.**
> - **🟠 WARNING**: 직접 악용은 불명확하나 위험한 패턴/방어 미흡(검증 부족, 과다 로깅, 약한 에러 처리).
> - **🟡 INFO**: 개선 권고/하드닝(심층 방어 강화 제안).
> - **🟢 VERIFIED**: 점검했고 방어가 확인된 부분(안심 근거). false positive로 보고했을 뻔한 것을 여기 둔다.

```
# 🔒 보안 감사 보고서 — OWASP Top 10:2021

대상: <git diff 범위 / 파일들>
판정: ❌ FAIL  (CRITICAL N건)   |   ✅ PASS  (CRITICAL 0건)

## 요약
| 등급 | 건수 |
|---|---|
| 🔴 CRITICAL | N |
| 🟠 WARNING | N |
| 🟡 INFO | N |
| 🟢 VERIFIED | N |

## 🔴 CRITICAL — 즉시 수정 (있으면 FAIL)
### [A0X] 제목
- 위치: `file:line`
- 공격 시나리오: <공격자가 구체적으로 어떻게 악용하는가 — 재현 경로>
- 근거: <취약한 코드 줄 인용>
- 완화: <정확한 수정 방법 / 코드>

## 🟠 WARNING
### [A0X] 제목 — 위치 · 위험 · 완화

## 🟡 INFO
- [A0X] 권고 — 위치 · 제안

## 🟢 VERIFIED (이미 방어됨 — 안심 근거)
- [A0X] <무엇을 확인했고 왜 안전한지> — 위치

## 판정 근거
- CRITICAL ≥ 1 → **FAIL**: 커밋·배포 차단. CRITICAL 전부 해소 후 재감사.
- CRITICAL = 0 → **PASS**: WARNING/INFO는 권고(차단 아님).
```

### 보고 규율 (false positive 회피)
- **이미 방어된 부분은 CRITICAL/WARNING으로 보고하지 않는다.** 코드를 따라가 방어 부재를 확증했을 때만 보고.
- CRITICAL은 **악용 시나리오를 한 문장 이상 구체적으로** 쓸 수 있어야 한다. 못 쓰면 WARNING 이하로 강등.
- 변경분(diff)에 없는 기존 코드의 문제는 직접 관련 없으면 INFO로만 짧게(스코프 유지).
- 추측·일반론 나열 금지. 위치(`file:line`)와 근거 코드를 항상 첨부.
- 깨끗하면 깨끗하다고 말한다 — 억지 지적 금지. VERIFIED로 점검 사실만 남긴다.
