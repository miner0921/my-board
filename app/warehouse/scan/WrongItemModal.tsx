"use client";

import { useEffect, useRef } from "react";

type Props = {
  itemName: string;
  message: string;
  onClose: () => void;
};

// 현재 송장에 없는 품목 바코드가 스캔됐을 때 띄우는 경고 모달.
// 강제 추가 옵션 없음 (데이터 무결성 보호). 확인 버튼 하나.
// ESC / Enter 둘 다 닫기로 동작 → 닫히면 부모가 입력란 focus 복원.
export default function WrongItemModal({ itemName, message, onClose }: Props) {
  const okBtnRef = useRef<HTMLButtonElement | null>(null);

  // 마운트 즉시 확인 버튼에 focus (USB 스캐너 입력이 input으로 흘러들어가지 않도록)
  useEffect(() => {
    okBtnRef.current?.focus();
  }, []);

  // 키보드 단축키
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
              다른 송장의 품목
            </h2>
            <p className="text-sm text-zinc-600 mt-1 whitespace-pre-line">
              {message}
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-5">
          <p className="text-[11px] text-zinc-500 mb-0.5">스캔한 품목</p>
          <p className="text-sm font-medium text-zinc-900 break-all">
            {itemName}
          </p>
        </div>

        <button
          ref={okBtnRef}
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
        >
          확인 (ESC / Enter)
        </button>
      </div>
    </div>
  );
}
