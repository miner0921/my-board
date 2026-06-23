"use client";

import { useEffect } from "react";
import ErrorFallback from "@/app/components/ErrorFallback";

// warehouse 공통 에러 경계.
//   - scan 밖의 warehouse 페이지(대시보드/송장 목록·상세/품목) 렌더 예외 격리.
//   - scan은 더 가까운 scan/error.tsx가 먼저 잡으므로 중복 아님.
//   - AppShell(사이드바·헤더)은 이 경계 바깥이라 그대로 생존.
export default function WarehouseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("출고 시스템 에러:", error);
  }, [error]);

  return (
    <ErrorFallback
      reset={reset}
      title="화면을 불러오지 못했습니다"
      message="잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요."
    />
  );
}
