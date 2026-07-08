# my-board: 출고 바코드 검수 시스템

발주서/송장 파일을 업로드해 출고 품목을 바코드로 검수하는 시스템.
메인 페이지(/)는 출고 대시보드(/warehouse)로 리다이렉트된다.
(과거 함께 있던 게시판 기능은 제거됨 — posts/comments 코드 삭제 완료.)

## 기술 스택
- Next.js 16.2.6 (App Router)
- PostgreSQL (로컬 개발 + Cloud SQL, PostgreSQL 18 서울)
- NextAuth.js v5
- Tailwind CSS v4
- TypeScript
- bcryptjs, pg

## 배포 환경
- GCP Cloud Run (서비스 manwol-barcode-system, region asia-northeast3 서울)
- Cloud SQL (PostgreSQL 18, 서울, DB명 warehouse)
- GitHub: github.com/miner0921/my-board
- 도메인: manwol-barcode.com
- 배포 명령: `gcloud run deploy manwol-barcode-system --source . --region asia-northeast3 --env-vars-file .env.deploy.local --quiet`
- 환경변수 파일: `.env.local`(로컬) / `.env.deploy.local`(배포). 실제 값(DATABASE_URL·AUTH_SECRET 등)은 이 파일들에만 있고 문서·코드에 쓰지 않는다.

## 기존 인프라 (재사용)
- 인증: NextAuth + Credentials Provider (auth.ts, auth.config.ts)
- DB 연결: lib/db.ts의 query 함수 — env(DATABASE_URL) 기반 pg.Pool, URL 패턴으로 SSL 자동 분기(localhost=SSL끔 / Cloud SQL 유닉스소켓=SSL불필요 / 그 외 원격=SSL)
- 미들웨어: proxy.ts
- 셸 UI(사이드바): app/components/AppShell.tsx + Sidebar.tsx
- 세션 타입: types/next-auth.d.ts

## 출고 시스템 도메인 개념
- **품목(Item)**: 출고할 상품. barcode(고유)와 name, image_url을 가짐
- **송장(Invoice)**: 출고 단위. invoice_no(바코드)와 여러 품목 포함
- **검수(Scan)**: 송장의 모든 품목 바코드를 스캔해 누락 없이 챙겼는지 확인
- **품목 매핑(InvoiceItem)**: 송장 안의 각 품목과 수량
- **스캔 로그(ScanLog)**: 누가 언제 무엇을 스캔했는지 (감사 추적)

## 품목 매칭 규칙 (정규화 품명 = 단일 키) ⭐
출고/검수 전체에서 "같은 품목"을 가르는 기준은 **정규화 품명 하나**다. 품목코드·구분·종류·바코드는 품목의 *속성*일 뿐 매칭 키가 아니다.

- **매칭 키 = `itemMatchKey(name)` (`lib/resolve-item.ts`)** = `normalizeProductName(name)`.
  - 모든 조회(송장 confirm·preview, 대량등록 confirm·preview)는 `buildItemIndex(items)`(정규화 품명→id)를 거친다. 인라인으로 맵을 다시 만들지 말 것.
  - **별칭(alias)은 `buildItemIndex` 안에서만 합친다** — 호출 측은 손대지 않는다(alias-ready).
- **저장되는 `items.name`은 항상 정규화형** = `buildItemName(구분, 종류)`(`lib/product-name.ts`) = `normalizeProductName(composeProductName(구분, 종류))`.
  - 불변식: `items.name === normalizeProductName(composeProductName(category, kind))`.
  - 엑셀 대량등록·개별 등록(POST)·개별 수정(PUT) 모두 이 함수 하나로 name을 만든다(복붙 금지).
  - 구분(category)/종류(kind)는 **입력 원본을 그대로 보존**(표시·재편집용). name만 정규화형.
- **송장 원문은 보존**: `invoices.raw_product_name`, `invoice_items.display_name`은 건드리지 않는다. 검수 화면 원문 표기는 이 값을 쓴다.
- **대량등록 판단 기준**: 정규화 품명. 같은 품명이면 그 품목(송장 자동생성 포함)에 품목코드·구분·종류·바코드를 채워 갱신, 없으면 신규. 품명이 다르면 새 품목(개명은 개별 수정으로).
- ⚠️ 검수 매칭은 정규화 품명을 비교하므로 **매칭 *동작*은 함부로 바꾸지 말 것**. 정규화 규칙 변경은 `lib/normalize-product.ts` 한 곳에서만.

### 별칭(같은 취급 품명) — `item_aliases`
품목별 특이 변형을 같은 품목으로 매칭하기 위한 보조 키. (테이블: 마이그레이션 023)

- **별칭 = 또 다른 정규화 품명(`normalized_alias`)이 같은 `item_id`를 가리키는 것.** 새 매칭 방식이 아니라 인덱스에 행을 추가하는 개념 — `buildItemIndex(items, aliases)`가 합치고, 실제 품목 품명이 우선(별칭이 덮지 않음).
- **적용 범위: 송장 매칭(`invoices/confirm`·`invoices/preview`)에만.** 두 곳은 `loadItemIndex(run)`(items+별칭)을 쓴다. **대량등록(bulk·bulk/preview)은 품목 name 기준(items-only)** — 별칭으로 마스터 품명이 오염되면 안 되므로 제외. (스캔은 바코드 매칭이라 무관.)
- **역할 분담**: 넓은/보편 패턴(★, (증정샘플) 등)은 `normalize-product.ts` 규칙으로, **품목별 idiosyncratic 변형만 별칭으로.** 정규화해도 다른 키일 때만 별칭이 의미 있음(정규화 시 품목 품명과 같아지면 등록 거부).
- **충돌은 하드 블록**(경고 후 강행 없음): 빈 별칭 / 품목 자기 품명과 동일 / 이 품목의 기존 별칭 중복 / 다른 품목의 품명·별칭과 충돌 / 200자 초과. `UNIQUE(normalized_alias)`가 최종 방어.
- **권한: 관리자만** 등록/삭제(`requireAdmin`). UI(수정 모달 "같은 취급 품명")도 관리자에게만 노출.

## 송장 안내 (관리자→작업자 소통)
검수 작업자가 스캔 화면 "송장 안내" 박스에서 보는 두 가지. 둘 다 없으면 박스 미표시. (마이그레이션 024)

- **관리자 메모 (`invoices.admin_memo`)**: 관리자가 송장에 남기는 처리 안내(예: "밀크티1kg 1개 추가"). 입력/수정은 **관리자만**(`PUT /api/warehouse/invoices/[id]/memo`, `requireAdmin`) — 송장 상세 페이지의 메모 에디터. 작업자는 보기만.
- **재개 사유**: 수동 재개 시 관리자가 입력한 사유. 스캔에는 **수동 재개분만** 표시한다 — `invoice_reopens.is_manual=true`(수동 재개 route만 true, 자동 재개는 false)인 최신 행의 `reason`. 자동 재개 고정 문구('…자동 재개')는 노이즈라 제외.
- 스캔 표시 데이터는 `loadInvoiceFull`이 `invoice_start` 응답에 `admin_memo`/`reopen_reason`으로 실어 보냄.

## 현장 추가 (검수 중 송장에 품목 추가)
검수 중 송장에 없는 품목을 추가하는 두 경로. 둘 다 `invoice_items.is_added_on_scan=TRUE`, 완료 송장이면 자동 재개. 권한: 로그인 작업자.

- **바코드 발**: 송장에 없는 바코드를 `force`로 스캔 → 새 행 `quantity=1, scanned_count=1`(찍는 행위=1개 챙김). `POST /api/warehouse/scan`.
- **검색 발(바코드 없는 품목용)**: 스캔 화면 "품목 추가" → 품명 검색 → `POST /api/warehouse/scan/add` → 새 행 `quantity=1, scanned_count=0`. 추가 후 **수동 챙김**(`/scan/manual`)으로 수량 확인(기존 흐름 연결). 바코드 없는 품목은 추가 직후 수량 모달 자동 오픈. 모든 품목 추가 가능(바코드 유무 무관). 이미 활성 행이면 중복 추가 안 함, 제외된 행이면 복구.
- 추가 행은 `quantity=1` 고정이라 수동 챙김으로 N개 set 시 `N/1`로 보일 수 있음(현장 추가분 성격 — force-add와 동일 모델).

## 사용자 권한
- 역할(role) 구분 있음: `users.role` = `'admin'` / `'user'` (마이그레이션 015, CHECK 제약).
  구분은 `lib/auth-helper.ts`의 `requireAdmin()` / `requireUser()`로 한다.
- **관리자 전용**: 별칭(item_aliases) 등록·삭제, 관리자 메모(admin_memo), 품목 신규·대량 등록.
- **작업자(로그인 전원) 가능**: 검수 스캔, 현장 추가, 수동 챙김, 결품 완료, 검수 재개, 수동완료, 송장번호 변경.
- 기본 원칙: 본인이 등록한 품목/송장만 수정/삭제 가능 (아래 is_auto_created 정책은 별개로 유지).

### 품목(items) 수정/삭제 권한
협업 시나리오를 위해 `items.is_auto_created` 플래그로 정책을 분기:

| 동작 | `is_auto_created = TRUE` (자동 등록) | `is_auto_created = FALSE` (직접 등록) |
|---|---|---|
| 바코드/이름/이미지 수정 | 로그인한 누구나 | 본인만 |
| 삭제 | 본인만 | 본인만 |

- 자동 등록 = 송장 업로드(`/api/warehouse/invoices/confirm`)에서 정규화로 만들어진 품목.
  바코드/이미지 보완을 다른 작업자가 이어받을 수 있어야 해서 공용 수정 허용.
- 직접 등록 = 새 품목 등록(모달)이나 대량 등록(엑셀/CSV)으로 만든 품목. 본인 소유로 격리.
- 권한 체크는 미들웨어 + 페이지 + API 삼중 방어 원칙 그대로 유지.

## 검수 시스템 작동 원리
- **단일 입력 + 서버 판별**: 모든 스캔이 한 입력란 → `sendScan(바코드)` 하나로 서버에 전송. 서버가 바코드 종류를 판별해 응답 `type`을 주고, 클라이언트는 그 `type`대로 **화면만 그린다**. 판정 로직을 클라이언트에서 다시 짜지 말 것. 입력 출처(물리 스캐너 / 카메라 / URL `?code`)는 무관 — 바코드 문자열만 `sendScan`에 넘기면 동일하게 동작한다.
- **스캔 흐름**: 송장 바코드→열림 / 품목 바코드→카운트 / 다 채우면 자동 완료 / 완료 후 다음 송장 찍으면 전환 / 미완료인데 다른 송장 찍으면 확인창.
- **완료 상태 3종**(completed / completed_partial / manual_completed). 완료 판정은 `lib/invoice-status.ts`의 `isCompletedStatus()` 헬퍼로 통일 — 여기저기 나열하지 말고 이 헬퍼를 쓴다. 상태가 늘어도 헬퍼만 고친다.
- **완료 규칙**: 완료 탭 송장(3종)은 새로 스캔하면 "이미 완료된 송장입니다"로 막힌다. 되돌리기는 상세의 재개 버튼으로만. (단, 이미 열려 스캔 중이던 송장의 연속 초과 스캔은 기존 자동재개 흐름 유지.)
- **삭제는 soft delete(`deleted_at`)만** — 하드 삭제 없음. `invoice_no`는 UNIQUE라 삭제해도 번호가 안 풀린다(재업로드로 정정 불가).
- **자식 테이블은 송장 id(정수)로 연결**: invoice_items, scan_logs, invoice_reopens 등 전부 송장의 `id`로 참조. `invoice_no`(문자열)로 참조하는 곳 없음 → 송장번호를 바꿔도 자식 데이터는 안 건드려도 된다.
- **로직/화면 분리**: 검수 화면 로직은 `app/warehouse/scan/useScanSession.ts` 훅에 있고, `page.tsx`(뷰)가 소비한다.

## 페이지 구조
| 경로 | 용도 | 비고 |
|---|---|---|
| / | /warehouse로 리다이렉트 | app/page.tsx |
| /login | 로그인 | |
| /warehouse | 출고시스템 대시보드 (메인 랜딩) | |
| /warehouse/items | 품목 목록/등록/수정/삭제 | 신규 |
| (품목 등록/수정/대량등록) | 품목관리 페이지 내 모달 | 별도 페이지 없음 |
| /warehouse/invoices | 송장 목록/등록 | 신규 |
| /warehouse/invoices/[id] | 송장 상세 + 품목 매핑 | 신규 |
| /warehouse/scan | 출고 검수 ⭐핵심⭐ | 신규 |
| /warehouse/history | 검수 이력 | 신규 |

## API 라우트 구조
- 공용 API: /api/signup, /api/auth/*, /api/profile/*, /api/admin/*
- 출고 API: /api/warehouse/items/*, /api/warehouse/invoices/*, /api/warehouse/scan, /api/warehouse/history

## DB 스키마

> ⚠️ 정확한 최신 스키마는 `migrations/` 폴더가 유일한 진실(source of truth). 아래는 큰 그림이며, 이후 마이그레이션이 반영 안 된 부분이 있을 수 있다.

### 공용 (인증/사용자)
- users (id, username, password, nickname, created_at) — 인증·작업자 정보로 계속 사용

### 미사용 (게시판 제거로 코드는 삭제됨 — 테이블은 DROP 안 함)
- posts, comments — 더 이상 어떤 코드도 참조하지 않음. 정리하려면 별도 migration 필요.

### 신규 (출고 시스템용)

```sql
-- 품목 마스터
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  barcode VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  image_data BYTEA,
  image_mime VARCHAR(100),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 송장
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  invoice_no VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending / completed / completed_partial(결품 완료) / manual_completed(수동완료)
  completed_at TIMESTAMP,
  completed_by INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 송장-품목 매핑
CREATE TABLE invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  scanned_count INTEGER DEFAULT 0,
  UNIQUE(invoice_id, item_id)
);

-- 스캔 이력
CREATE TABLE scan_logs (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id),
  item_id INTEGER REFERENCES items(id),
  user_id INTEGER REFERENCES users(id),
  is_error BOOLEAN DEFAULT false,
  error_reason VARCHAR(100),
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_items_barcode ON items(barcode);
CREATE INDEX idx_invoices_invoice_no ON invoices(invoice_no);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_scan_logs_invoice ON scan_logs(invoice_id);
```

### 이후 추가된 주요 테이블 (이름·용도만 — 상세 구조는 migrations 참조)
- item_aliases — 같은 취급 품명(별칭)
- item_barcodes — 품목 다중 바코드
- invoice_reopens — 송장 재개 이력
- invoice_no_changes — 송장번호 변경 이력
- upload_files / upload_batches — 업로드 원본 엑셀 보관
- access_logs — 감사 로그

## 이미지 저장 방식
**DB의 BYTEA 컬럼에 직접 저장** (Cloud Run/Cloud SQL 호환, 파일시스템 쓰기 불필요)
- `items` 테이블에 `image_data BYTEA` + `image_mime VARCHAR(100)` 두 컬럼 사용
- `multipart/form-data`로 업로드 받아 `Buffer`로 변환 후 INSERT
- 검증은 `lib/upload.ts`의 `readUploadedImage()` 재사용
  - 허용 형식: image/jpeg, image/png, image/gif, image/webp
  - 최대 크기: 5MB
- 목록/단일 조회 쿼리는 BYTEA를 **절대 SELECT하지 않음**
  - `(image_data IS NOT NULL) AS has_image` 로 존재 여부만 가져옴 (성능)
- 이미지 바이트는 별도 라우트(`/api/warehouse/items/[id]/image`)에서 서빙
  - 응답 헤더에 `Content-Type: image_mime`, `ETag`, `Cache-Control: private` 부착
- `<img src="/api/warehouse/items/[id]/image?v={updated_at_ts}">` 형태로 수정 시 자동 캐시 갱신

## 모바일/태블릿 지원
- 검수 작업은 태블릿에서 많이 함 → /warehouse/scan은 모바일 우선 디자인
- Tailwind 반응형 클래스 적극 활용 (sm:, md:, lg:)
- 터치 친화적 버튼 크기 (최소 44x44px)
- 큰 입력창 (바코드 스캐너 입력 받기 좋게)

## 코딩 규칙
- 모든 응답/주석은 한국어, 변수/함수명은 영어
- Server Component 기본, 인터랙션 필요 시에만 "use client"
- API는 NextResponse.json() 사용
- 권한 체크: 미들웨어 + 페이지 + API 삼중 방어
- params는 Promise (Next.js 16): const { id } = await params
- DB의 id(number)와 session.user.id(string) 비교 시 String() 변환
- 비밀번호는 bcrypt.hash로 해시 후 저장
- 에러 메시지는 사용자 친화적 한국어로
- 날짜 포맷: YYYY-MM-DD HH:mm

## 작업 시 주의사항
1. **공용 인프라는 신중히 변경**
   - lib/db.ts, auth.ts, auth.config.ts, proxy.ts는 전 구간 공용 — 변경 시 영향 범위 확인
   - 셸 UI(AppShell/Sidebar)는 /warehouse·/admin·/profile 공통

2. **출고 시스템은 /warehouse 경로로 모두 격리**
   - 페이지: app/warehouse/*
   - API: app/api/warehouse/*

3. **DB 스키마 변경은 절대 직접 실행 금지**
   - 항상 migrations/ 폴더에 SQL 파일로 만들어줄 것
   - 실행 방법 명시할 것 (로컬은 로컬 PostgreSQL, 실서버는 Cloud SQL)
   - 사용자가 직접 실행 — 로컬은 로컬 PostgreSQL, 실서버는 Cloud SQL에서

4. **큰 변경 전 계획 보고**
   - 어떤 파일을 만들/수정/삭제할지 먼저 보여줄 것
   - 사용자 승인 후 실행

5. **새 npm 패키지 추가 시 사전 알림**

6. **디버깅 console.log는 작업 끝나면 제거**

7. **지시 범위 준수**
   - 지시받은 것만 한다. 지시에 없는 개선·추가·리팩터·리네이밍을 임의로 하지 마라.
   - "이왕 하는 김에"도 금지. 넣는 게 낫다고 판단되면 먼저 물어보고 승인받은 뒤에만 한다.

8. **민감정보 보호**
   - 비밀번호, DATABASE_URL·AUTH_SECRET 등 시크릿, 수령인 개인정보(이름·전화·주소)를 출력·로그·응답에 노출하지 마라.
   - 조회 결과에 섞이면 마스킹(***)하거나 아예 가져오지 않는다. DB describe는 전체 말고 필드명만.

9. **배포는 포그라운드로 끝까지 지켜본다**
   - 백그라운드 금지(멈춘 적 있음). 배포 후 새 리비전명과 트래픽 100%를 확인한다.

10. **로컬 먼저, 실서버는 나중**
   - 코드·SQL은 로컬에서 먼저 확인하고 실서버 반영은 배포 시점에.
   - 스크립트·SQL 실행 시 "지금 로컬이냐 실서버냐"를 매번 확인(.env.local=로컬 / .env.deploy.local=실서버).

## 파일 구조 컨벤션

```
app/
├── page.tsx (/ → /warehouse 리다이렉트)
├── layout.tsx, login/, signup/, profile/, admin/
├── components/ (AppShell.tsx, Sidebar.tsx)
├── warehouse/
│   ├── page.tsx (대시보드)
│   ├── items/
│   │   ├── page.tsx (목록)
│   │   ├── DeleteButton.tsx (목록 카드에서 사용)
│   │   ├── new/page.tsx
│   │   ├── [id]/edit/page.tsx
│   │   └── bulk/page.tsx
│   ├── invoices/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── scan/
│   │   └── page.tsx (검수 화면 - 핵심)
│   └── history/
│       └── page.tsx
└── api/
    ├── auth/, signup/, profile/, admin/, login-status/
    └── warehouse/
        ├── items/route.ts
        ├── items/[id]/route.ts
        ├── items/[id]/image/route.ts
        ├── items/bulk/route.ts
        ├── invoices/route.ts
        ├── invoices/[id]/route.ts
        ├── invoices/by-barcode/route.ts
        ├── scan/route.ts
        └── history/route.ts

lib/
├── db.ts (기존)
└── upload.ts (이미지 업로드 헬퍼 - 신규)

migrations/
├── 001_warehouse_schema.sql (DB 변경 SQL 보관소)
└── 002_items_image_bytea.sql (items 이미지 BYTEA 전환)
```