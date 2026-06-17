# 출고 바코드 검수 시스템 작업 계획

## Phase 1: 기반 설정
- [ ] DB 스키마 SQL 파일 작성 (migrations/001_warehouse_schema.sql)
- [ ] 사용자가 Neon SQL Editor에서 실행
- [ ] 사이드바 셸 + 대시보드 진입 메뉴
- [ ] /warehouse 대시보드 페이지 (간단한 카드 메뉴)

## Phase 2: 품목 관리
- [ ] /warehouse/items 목록 페이지
- [ ] /warehouse/items/new 등록 페이지
- [ ] /warehouse/items/[id]/edit 수정
- [ ] 삭제 기능 (본인 등록 품목만)
- [ ] 이미지 업로드 API
- [ ] CRUD API

## Phase 3: 품목 대량 등록
- [ ] /warehouse/items/bulk CSV 업로드 페이지
- [ ] CSV 파싱 + 검증
- [ ] 일괄 INSERT
- [ ] 결과 리포트

## Phase 4: 송장 관리
- [ ] /warehouse/invoices 목록
- [ ] /warehouse/invoices/new 등록
- [ ] /warehouse/invoices/[id] 상세 + 품목 매핑
- [ ] API

## Phase 5: 출고 검수 (핵심)

### 5-1. 송장 입력 화면
- [ ] /warehouse/scan 페이지 기본 구조
- [ ] 송장 바코드 입력 input
- [ ] Enter 시 송장 조회 API 호출

### 5-2. 품목 목록 표시
- [ ] 송장 인식 후 품목 카드 그리드
- [ ] 카드: 이미지, 품목명, 바코드, 0/N 카운트

### 5-3. 품목 스캔 처리
- [ ] 품목 바코드 input
- [ ] 검증 로직
- [ ] 카드 상태 업데이트
- [ ] scan_logs 기록

### 5-4. 시각/청각 피드백
- [ ] 성공: 초록 플래시 + 사운드
- [ ] 오류: 빨간 플래시 + 경고음
- [ ] 진동 (모바일)

### 5-5. 완료 처리
- [ ] 전체 완료 감지
- [ ] 완료 모달
- [ ] 다음 송장 자동 전환

### 5-6. 모바일 최적화
- [ ] 큰 입력창
- [ ] 터치 친화적 버튼

## Phase 6: 이력 페이지
- [ ] /warehouse/history 검수 목록
- [ ] 필터: 날짜, 작업자, 송장
- [ ] 상세 보기

## Phase 7: 마무리
- [ ] 빈 상태 화면
- [ ] 로딩 상태
- [ ] 에러 처리

## Phase 8: (선택) 프로덕션 이미지 저장
- 로컬 파일 시스템 → Cloudinary 전환