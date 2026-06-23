"use client";

import { useEffect } from "react";
import ErrorFallback from "@/app/components/ErrorFallback";

// 최상위 에러 경계.
//   - warehouse 밖(루트 하위) + 하위 경계가 못 잡은 것의 최종 폴백.
//   - 루트 layout 자체 예외는 못 잡음(그건 global-error 영역 — 이번 범위 제외).
//   - AppShell 없이 단독 렌더되므로 [홈으로]로 /warehouse 복귀 동선 제공.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("앱 에러:", error);
  }, [error]);

  return (
    <ErrorFallback
      reset={reset}
      title="문제가 발생했습니다"
      message="잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요."
    />
  );
}
