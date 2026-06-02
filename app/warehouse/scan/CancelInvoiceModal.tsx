"use client";

import { useEffect, useRef } from "react";

type Props = {
  invoiceNo: string;
  scannedQty: number;
  totalQty: number;
  onCancel: () => void;
  onConfirm: () => void;
};

// 진행 중 검수를 자발적으로 떠나려 할 때 띄우는 확인 모달.
// ([송장 변경] 버튼으로 트리거).
// 진행률은 DB에 그대로 보존됨 — 나중에 같은 송장 스캔하면 이어서 검수.
//
// ESC = 취소(계속 검수), Enter = 송장 대기로.
export default function CancelInvoiceModal({
  invoiceNo,
  scannedQty,
  totalQty,
  onCancel,
  onConfirm,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmBtnRef.current?.focus();
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
          <div className="text-3xl">🚪</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-900">
              진행 중인 검수를 취소합니다
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              현재 송장에서 빠져 송장 대기 화면으로 돌아갑니다.
              <br />
              <span className="text-xs text-zinc-500">
                진행률은 보존되므로 같은 송장을 다시 스캔하면 이어서
                검수할 수 있습니다.
              </span>
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-5">
          <p className="text-[11px] text-zinc-500 mb-0.5">현재 송장</p>
          <p className="text-sm font-mono text-zinc-900 break-all">
            {invoiceNo}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            진행률 {scannedQty} / {totalQty}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
          >
            계속 검수 (ESC)
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
          >
            송장 대기로 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
