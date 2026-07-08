"use client";

import { useScanSession } from "./useScanSession";
import { useIsMobile } from "./useIsMobile";
import ScanDesktopView from "./ScanDesktopView";
import ScanMobileView from "./ScanMobileView";

// ─────────────────────────────────────────────────────────────
// 검수 화면 진입점 — 화면 폭에 따라 뷰만 분기한다.
//   - useScanSession() 을 여기서 1회만 호출해 세션을 소유하고, 두 뷰에 prop 전달.
//     훅이 항상 마운트된 이 컴포넌트에 있어, 리사이즈로 뷰가 바뀌어도 세션 보존.
//   - 임계값 1024px 이하 = 모바일 뷰.
// ─────────────────────────────────────────────────────────────
export default function ScanPage() {
  const session = useScanSession();
  const isMobile = useIsMobile(1024);

  return isMobile ? (
    <ScanMobileView session={session} />
  ) : (
    <ScanDesktopView session={session} />
  );
}
