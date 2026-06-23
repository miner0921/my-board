"use client";

import { useEffect } from "react";
import ErrorFallback from "@/app/components/ErrorFallback";

// 검수 화면 전용 에러 경계.
//   - 검수 화면 렌더 예외만 여기서 격리(AppShell·다른 warehouse 페이지 영향 없음).
//   - 단순 유지: reset/error만 받고 ErrorFallback에 위임.
//   - 상세는 운영자 디버깅용으로 console.error에만.
export default function ScanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("검수 화면 에러:", error);
  }, [error]);

  return (
    <ErrorFallback
      reset={reset}
      title="검수 중 문제가 발생했습니다"
      message="송장을 다시 스캔해 계속하세요. 문제가 계속되면 관리자에게 알려주세요."
    />
  );
}
