"use client";

import { useEffect, useRef } from "react";

type Props = {
  itemName: string;
  quantity: number;
  scannedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
};

// 이미 송장 수량만큼 챙긴 품목에 같은 바코드를 다시 찍었을 때.
// 서버가 자동으로 카운트를 증가시키지 않고 이 모달로 사용자 의도 확인.
//   - [취소(ESC)]      : 닫음, 카운트 변화 없음 (오스캔 가정)
//   - [수량 추가(Enter)]: force=true로 재요청 → +1 (고객 추가 요청 등 의도적 추가)
// 닫히면 부모가 입력란 focus 복원.
export default function OverQuantityModal({
  itemName,
  quantity,
  scannedCount,
  onCancel,
  onConfirm,
}: Props) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // 마운트 즉시 [취소]에 focus — 스캐너가 즉시 연속 입력을 보내도
  // input으로 흘러들어가지 않게 한다.
  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-3xl">⚠️</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-900">
              수량 초과
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              이미 수량만큼 챙긴 품목입니다.
              <br />
              추가로 더 보내려면 [수량 추가]를 누르세요.
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-5">
          <p className="text-[11px] text-zinc-500 mb-0.5">품목</p>
          <p className="text-sm font-medium text-zinc-900 break-all mb-2">
            {itemName}
          </p>
          <p className="text-xs text-zinc-600">
            현재:{" "}
            <span className="font-semibold text-zinc-900">
              {scannedCount}/{quantity}
            </span>{" "}
            (모두 스캔됨)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
          >
            취소 (ESC)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition"
          >
            수량 추가 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
