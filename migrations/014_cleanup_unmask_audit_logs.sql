-- =====================================================
-- 014. invoice.view_unmasked 감사 로그 정리
-- =====================================================
-- 로컬 개발: pgAdmin에서 boarddb 선택 후 Query Tool에서 실행
-- 배포 시: Neon SQL Editor에서 동일하게 실행
--
-- 마스킹 기능을 제거하면서 그동안 쌓인 "평문 조회(invoice.view_unmasked)"
-- 감사 로그가 더 이상 의미를 갖지 않으므로 일괄 삭제.
--
-- 재실행 안전 (이미 삭제된 후엔 0건 영향).
-- 다른 access_logs 행에는 영향 없음.
-- =====================================================

DELETE FROM access_logs WHERE action = 'invoice.view_unmasked';
