"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  invoiceId: number;
  invoiceNo: string;
};

// 관리자 전용 송장 삭제 버튼 + 확인 모달.
// 삭제 시 invoice_items / scan_logs / invoice_reopens / invoices 모두 제거.
// 되돌릴 수 없는 작업이므로 확인 모달 필수.
// 사유는 선택 입력 (audit 용도).
export default function DeleteInvoiceButton({ invoiceId, invoiceNo }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

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

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setReason("");
    setError("");
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/invoices/${invoiceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "삭제에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.push("/warehouse/invoices");
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
        className="block w-full py-3 rounded-lg text-sm font-medium border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 transition text-center"
      >
        🗑️ 송장 삭제
      </button>
      <p className="text-[11px] text-zinc-400 text-center mt-2">
        관리자 전용 · 되돌릴 수 없는 작업입니다
      </p>

      {open && (
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
                  송장 삭제
                </h2>
                <p className="text-sm text-zinc-600 mt-1">
                  이 송장과 관련된 모든 검수 이력이 함께 삭제됩니다.
                  <br />
                  <span className="text-red-700 font-medium">
                    되돌릴 수 없습니다.
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4">
              <p className="text-[11px] text-zinc-500 mb-0.5">송장번호</p>
              <p className="text-sm font-mono text-zinc-900 break-all">
                {invoiceNo}
              </p>
            </div>

            <div className="mb-4">
              <label
                htmlFor="delete-reason"
                className="block text-xs text-zinc-500 mb-1"
              >
                삭제 사유 (선택)
              </label>
              <textarea
                id="delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                rows={2}
                placeholder="예: 잘못 업로드된 송장"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              />
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
                onClick={handleDelete}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {submitting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
