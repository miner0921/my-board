"use client";

import { useEffect, useRef, useState } from "react";

// 위험 모달 공통 키 가드 — 바코드 스캐너 자동 Enter로 인한 오작동 방지.
//
// 배경: 바코드 스캐너는 스캔 끝에 자동으로 Enter를 친다. 위험 모달(수량 초과·
//   다른 송장 품목·송장 이동·세션 리셋)이 뜬 줄 모르고 작업자가 다음 바코드를
//   찍으면 그 자동 Enter가 위험 동작을 트리거 → 오출고.
//
// 원칙: 위험 모달은 키보드로 아무것도 하지 않는다(확인도 닫기도 X).
//   확인·취소는 오직 마우스 클릭/터치로만. 모달이 버티는 게 의도된 안전장치 —
//   작업자가 결국 화면을 보고 알아채게 한다.
//
// 동작:
//   - 모달이 떠 있는 동안 전역 keydown(Enter/Escape 포함)을 모두 가로채 preventDefault.
//   - 스캐너 종단인 Enter가 들어오면 "차단된 스캔"으로 보고 onBlockedScan() 호출
//     (경고음·진동·배너) + blocked=true 로 모달 안 배너를 띄운다.
//   - 어떤 키도 onConfirm/onCancel 을 부르지 않는다.
//
// 사용 측은 반환된 containerRef 를 다이얼로그 컨테이너(tabIndex=-1)에 걸어
//   마운트 시 focus 시킨다 → 위험 버튼이 포커스를 받지 않아 네이티브 Enter 클릭이
//   원천 차단된다. blocked 로 <BlockedScanBanner/> 노출 여부를 제어한다.
export function useScannerBlockGuard(onBlockedScan: () => void) {
  const [blocked, setBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 최신 콜백 참조 — 리스너를 매번 재설치하지 않도록 ref에 보관.
  const onBlockedScanRef = useRef(onBlockedScan);
  useEffect(() => {
    onBlockedScanRef.current = onBlockedScan;
  }, [onBlockedScan]);

  // 마운트 즉시 컨테이너에 focus — 위험 버튼으로 포커스가 가지 않게 한다.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // 위험 모달이 떠 있는 동안 키보드 동작을 전부 무력화한다.
      if (e.key === "Enter") {
        // 스캐너 종단 Enter = 차단된 스캔. 경고를 주되 모달은 닫지 않는다.
        e.preventDefault();
        setBlocked(true);
        onBlockedScanRef.current();
      } else if (e.key === "Escape") {
        // 닫기조차 키보드로는 막는다(엄격). 취소는 클릭 전용.
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return { blocked, containerRef };
}
