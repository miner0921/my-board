// 송장 완료 상태 판정 (서버·클라이언트 공용, 서버 전용 의존 없음).
//
// 완료 탭에 뜨는 세 상태는 모두 "완료된 송장"으로 취급한다:
//   - completed          : 정상 완료(전량 스캔)
//   - completed_partial  : 결품 완료
//   - manual_completed   : 수동완료(스캔 없이 완료 처리)
//
// 완료 판정을 이 함수 한 곳으로 모아, 앞으로 상태가 늘어도 여기만 고치면 되게 한다.
// (SQL의 WHERE status IN (...) 처럼 함수를 못 쓰는 곳은 세 값을 직접 나열한다.)
export const COMPLETED_STATUSES = [
  "completed",
  "completed_partial",
  "manual_completed",
] as const;

export function isCompletedStatus(status: string | null | undefined): boolean {
  return (
    status === "completed" ||
    status === "completed_partial" ||
    status === "manual_completed"
  );
}
