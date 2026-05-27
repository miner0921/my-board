# my-board: 게시판 + 출고 바코드 검수 시스템

이 프로젝트는 두 개의 기능을 가집니다:
1. **게시판** (기존 완성, 배포됨) - 메인 페이지(/)
2. **출고 바코드 검수 시스템** (개발 중) - 헤더의 "바코드 관리" 메뉴

## 기술 스택
- Next.js 15 (App Router)
- PostgreSQL (Neon 클라우드 + 로컬 개발용)
- NextAuth.js v5
- Tailwind CSS v4
- TypeScript
- bcryptjs, pg

## 배포 환경
- Vercel (자동 배포)
- Neon PostgreSQL (Singapore region)
- DATABASE_URL과 AUTH_SECRET은 Vercel 환경변수에 설정됨

## 기존 인프라 (재사용)
- 인증: NextAuth + Credentials Provider (auth.ts, auth.config.ts)
- DB 연결: lib/db.ts의 query 함수 (Neon SSL 자동 처리)
- 미들웨어: middleware.ts
- 헤더: app/components/Header.tsx
- 세션 타입: types/next-auth.d.ts

## 출고 시스템 도메인 개념
- **품목(Item)**: 출고할 상품. barcode(고유)와 name, image_url을 가짐
- **송장(Invoice)**: 출고 단위. invoice_no(바코드)와 여러 품목 포함
- **검수(Scan)**: 송장의 모든 품목 바코드를 스캔해 누락 없이 챙겼는지 확인
- **품목 매핑(InvoiceItem)**: 송장 안의 각 품목과 수량
- **스캔 로그(ScanLog)**: 누가 언제 무엇을 스캔했는지 (감사 추적)

## 사용자 권한
- 모든 사용자가 로그인만 하면 모든 기능 사용 가능
- 권한 분리(admin/worker) 없음
- 기본 원칙: 본인이 등록한 품목/송장만 수정/삭제 가능 (게시판처럼)

### 품목(items) 수정/삭제 권한
협업 시나리오를 위해 `items.is_auto_created` 플래그로 정책을 분기:

| 동작 | `is_auto_created = TRUE` (자동 등록) | `is_auto_created = FALSE` (직접 등록) |
|---|---|---|
| 바코드/이름/이미지 수정 | 로그인한 누구나 | 본인만 |
| 삭제 | 본인만 | 본인만 |

- 자동 등록 = 송장 업로드(`/api/warehouse/invoices/confirm`)에서 정규화로 만들어진 품목.
  바코드/이미지 보완을 다른 작업자가 이어받을 수 있어야 해서 공용 수정 허용.
- 직접 등록 = `/warehouse/items/new`나 CSV 대량 등록으로 만든 품목. 본인 소유로 격리.
- 권한 체크는 미들웨어 + 페이지 + API 삼중 방어 원칙 그대로 유지.

## 페이지 구조
| 경로 | 용도 | 비고 |
|---|---|---|
| / | 게시판 메인 | 기존 유지, 절대 변경 금지 |
| /posts/* | 게시판 페이지들 | 기존 유지, 절대 변경 금지 |
| /signup, /login | 회원가입/로그인 | 기존 유지 |
| /warehouse | 출고시스템 대시보드 (메뉴) | 신규 |
| /warehouse/items | 품목 목록/등록/수정/삭제 | 신규 |
| /warehouse/items/bulk | CSV 대량 등록 | 신규 |
| /warehouse/invoices | 송장 목록/등록 | 신규 |
| /warehouse/invoices/[id] | 송장 상세 + 품목 매핑 | 신규 |
| /warehouse/scan | 출고 검수 ⭐핵심⭐ | 신규 |
| /warehouse/history | 검수 이력 | 신규 |

## API 라우트 구조
- 게시판 API: /api/posts/*, /api/signup, /api/auth/* (기존 유지)
- 출고 API: /api/warehouse/items/*, /api/warehouse/invoices/*, /api/warehouse/scan, /api/warehouse/history

## DB 스키마

### 기존 (변경 금지)
- users (id, username, password, nickname, created_at)
- posts (id, title, content, user_id, barcode, created_at, updated_at)
- comments (id, post_id, user_id, content, created_at)

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
  status VARCHAR(20) DEFAULT 'pending',
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

## 이미지 저장 방식
**DB의 BYTEA 컬럼에 직접 저장** (게시판과 동일 방식, Vercel/Neon 양쪽 호환)
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
- params는 Promise (Next.js 15): const { id } = await params
- DB의 id(number)와 session.user.id(string) 비교 시 String() 변환
- 비밀번호는 bcrypt.hash로 해시 후 저장
- 에러 메시지는 사용자 친화적 한국어로
- 날짜 포맷: YYYY-MM-DD HH:mm

## 작업 시 주의사항
1. **기존 게시판 코드는 절대 수정 금지**
   - app/page.tsx, app/posts/*, app/api/posts/*, app/api/signup
   - 헤더(app/components/Header.tsx)는 메뉴 추가만 OK, 기존 메뉴는 유지

2. **출고 시스템은 /warehouse 경로로 모두 격리**
   - 페이지: app/warehouse/*
   - API: app/api/warehouse/*

3. **DB 스키마 변경은 절대 직접 실행 금지**
   - 항상 migrations/ 폴더에 SQL 파일로 만들어줄 것
   - 실행 방법 (Neon SQL Editor) 명시할 것
   - 사용자가 직접 Neon SQL Editor에서 실행

4. **큰 변경 전 계획 보고**
   - 어떤 파일을 만들/수정/삭제할지 먼저 보여줄 것
   - 사용자 승인 후 실행

5. **새 npm 패키지 추가 시 사전 알림**

6. **디버깅 console.log는 작업 끝나면 제거**

## 파일 구조 컨벤션

```
app/
├── (기존 게시판 파일들 - 그대로 유지)
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
    ├── (기존 게시판 API들 - 그대로 유지)
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