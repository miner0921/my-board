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
- 다만 본인이 등록한 품목/송장만 수정/삭제 가능 (게시판처럼)

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
  image_url TEXT,
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
**로컬 파일 업로드 (public 폴더)**
- 업로드 경로: `public/uploads/items/`
- 파일명: `{timestamp}-{원본파일명}` (충돌 방지)
- DB에는 `/uploads/items/파일명` 형태로 저장
- API 라우트에서 처리 (Next.js의 formData 사용)
- 허용 형식: jpg, jpeg, png, webp
- 최대 크기: 5MB
- **주의**: Vercel 배포 환경에서는 파일 시스템이 ephemeral이라 영구 저장 안 됨. 
  로컬 개발에서는 OK. 프로덕션 배포 시에는 Cloudinary 등으로 전환 필요.

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
│   │   ├── new/page.tsx
│   │   ├── [id]/edit/page.tsx
│   │   ├── [id]/DeleteButton.tsx
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
        ├── items/upload-image/route.ts
        ├── items/bulk/route.ts
        ├── invoices/route.ts
        ├── invoices/[id]/route.ts
        ├── invoices/by-barcode/route.ts
        ├── scan/route.ts
        └── history/route.ts

lib/
├── db.ts (기존)
└── upload.ts (이미지 업로드 헬퍼 - 신규)

public/
└── uploads/
    └── items/ (품목 이미지)

migrations/
└── 001_warehouse_schema.sql (DB 변경 SQL 보관소)
```