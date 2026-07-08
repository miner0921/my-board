"use client";

import { useCallback, useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────
// 화면 폭이 모바일인지 여부를 반환하는 훅.
//   - window.matchMedia(`(max-width: ${maxWidth}px)`) 로 판정.
//   - useSyncExternalStore 로 matchMedia 를 외부 store 처럼 구독:
//     subscribe(변경 리스너 등록·해제) + getSnapshot(현재 값).
//   - SSR 안전: getServerSnapshot 이 서버 렌더/하이드레이션 초기값을 false 로
//     고정 → 서버 HTML 과 클라이언트 첫 렌더가 일치(hydration 불일치 없음).
//     실제 폭은 마운트 커밋 직후 getSnapshot 값으로 전환된다.
//   - effect 안 동기 setState 를 쓰지 않아 cascading render 경고도 없음.
// 기본 임계값 768px 이하 = 모바일.
// ─────────────────────────────────────────────────────────────
export function useIsMobile(maxWidth: number = 768): boolean {
  const query = `(max-width: ${maxWidth}px)`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );

  // 서버 렌더 및 하이드레이션 초기값 — window 없으므로 항상 false.
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
