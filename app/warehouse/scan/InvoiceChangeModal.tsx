"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  currentInvoice: {
    invoice_no: string;
    scanned_qty: number;
    total_qty: number;
  };
  nextInvoice: { invoice_no: string };
  onCancel: () => void;
  onConfirm: () => void;
};

// 진행 중 송장이 있는데 다른 송장 바코드가 스캔됐을 때.
// 진행률 0% 초과인 경우만 표시됨 (서버에서 이미 필터링).
// ESC = 취소, Enter = 이동 (스캐너가 보내는 Enter도 처리).
export default function InvoiceChangeModal({
  currentInvoice,
  nextInvoice,
  onCancel,
  onConfirm,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // 마운트 시 [그대로 이동] 버튼에 focus
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

  const remaining = currentInvoice.total_qty - currentInvoice.scanned_qty;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle
            size={28}
            strokeWidth={1.75}
            className="shrink-0 text-amber-500 mt-0.5"
          />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-900">
              송장 변경 확인
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              진행 중인 송장이 있습니다. 그대로 이동할까요?
              <br />
              <span className="text-xs text-zinc-500">
                (현재 송장의 진행률은 보존됩니다)
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-[11px] text-amber-700 mb-0.5">현재 송장</p>
            <p className="text-sm font-mono text-zinc-900 break-all">
              {currentInvoice.invoice_no}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              진행률 {currentInvoice.scanned_qty} / {currentInvoice.total_qty}
              {remaining > 0 && (
                <span className="ml-1">· 미완료 {remaining}건</span>
              )}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[11px] text-blue-700 mb-0.5">새 송장</p>
            <p className="text-sm font-mono text-zinc-900 break-all">
              {nextInvoice.invoice_no}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
          >
            취소 (ESC)
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
          >
            그대로 이동 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
