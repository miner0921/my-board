"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, AlertTriangle } from "lucide-react";

type Props = {
  invoiceId: number;
  invoiceNo: string;
};

// 송장 삭제 버튼 + 확인 모달 (로그인한 작업자 전원).
// 완전삭제가 아니라 soft delete — 검수 이력(scan_logs) 등은 보존되고
// "삭제 항목 보기"에서 복구할 수 있다.
export default function DeleteInvoiceButton({ invoiceId, invoiceNo }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setError("");
  };

  useEffect(() => {
    if (open) cancelBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  const handleHide = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/invoices/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [invoiceId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "삭제에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.push("/warehouse/invoices");
      router.refresh(); // Router Cache 잔상 차단 — 목록을 새로 받게
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 w-full py-3 rounded-lg text-sm font-medium border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 transition"
      >
        <EyeOff size={16} strokeWidth={1.75} />
        송장 삭제
      </button>
      <p className="text-[11px] text-zinc-400 text-center mt-2">
        목록에서 삭제되며 복구할 수 있습니다 (검수기록 보존)
      </p>

      {open && (
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
                className="shrink-0 text-red-500 mt-0.5"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  송장 삭제
                </h2>
                <p className="text-sm text-zinc-600 mt-1">
                  이 송장을 목록에서 삭제합니다. 검수 이력은 보존되며,
                  <br />
                  <span className="font-medium">삭제 항목 보기</span>에서 복구할
                  수 있습니다.
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4">
              <p className="text-[11px] text-zinc-500 mb-0.5">송장번호</p>
              <p className="text-sm font-mono text-zinc-900 break-all">
                {invoiceNo}
              </p>
            </div>

            {error && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
              >
                취소 (ESC)
              </button>
              <button
                type="button"
                onClick={handleHide}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {submitting ? "처리 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
