"use client";

import { AlertTriangle } from "lucide-react";

// 위험 모달 안에 뜨는 "스캔 차단" 경고 배너.
// 모달이 화면을 덮으므로 경고는 모달 내부에 표시해야 작업자에게 보인다.
// useScannerBlockGuard 의 blocked 가 true 일 때만 렌더.
export default function BlockedScanBanner() {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 animate-pulse"
    >
      <AlertTriangle
        size={20}
        strokeWidth={2}
        className="shrink-0 text-red-600 mt-0.5"
      />
      <p className="text-sm font-semibold text-red-700">
        ⚠️ 스캔이 차단됐습니다 — 처리 대기 중인 경고가 있습니다
      </p>
    </div>
  );
}
