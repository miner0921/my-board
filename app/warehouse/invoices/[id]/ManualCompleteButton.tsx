"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

type Props = {
  invoiceId: number;
  invoiceNo: string;
  recipientName: string | null;
};

// 대기(pending) 송장을 스캔 없이 "수동완료" 처리하는 버튼 + 확인 모달(단건).
// API: POST /api/warehouse/invoices/manual-complete  body { invoice_id }.
//
// ★ Enter 자동 확정 방지: 스캐너가 쏘는 Enter로 모달이 자동 승인되던 이력 때문에
//   Enter 핸들러를 아예 걸지 않는다(물리적 클릭만 실행). 마운트 시 [취소]에 focus,
//   ESC로만 닫힌다. (ReopenButton 모달과 동일한 방식.)
export default function ManualCompleteButton({
  invoiceId,
  invoiceNo,
  recipientName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    // 스캐너 우발 입력이 확인으로 흘러들지 않도록 [취소] 버튼에 focus.
    cancelBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, submitting]);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setError("");
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/invoices/manual-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "수동완료에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      const completed: number = data?.completed ?? 0;
      const skippedCount: number = Array.isArray(data?.skipped)
        ? data.skipped.length
        : 0;
      const msg =
        skippedCount > 0
          ? `${completed}건 수동완료 완료. ${skippedCount}건은 이미 처리되어 건너뜀.`
          : `${completed}건 수동완료 완료.`;
      setOpen(false);
      alert(msg);
      // 상세 서버 컴포넌트 재조회 → 상태가 manual_completed로 바뀌고 버튼이 숨겨진다.
      router.refresh();
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
        className="flex items-center justify-center gap-1.5 w-full py-3 rounded-lg text-sm font-medium border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition"
      >
        <CheckCheck size={16} strokeWidth={1.75} />
        수동완료
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 my-8">
            <div className="flex items-start gap-3 mb-4">
              <CheckCheck
                size={28}
                strokeWidth={1.75}
                className="shrink-0 text-purple-600 mt-0.5"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  수동완료
                </h2>
                <p className="text-sm text-zinc-600 mt-1">
                  이 송장을 수동완료 처리합니다. 계속하시겠습니까?
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4">
              <p className="text-[11px] text-zinc-500 mb-0.5">송장번호</p>
              <p className="text-sm font-mono text-zinc-900 break-all">
                {invoiceNo}
                {recipientName ? (
                  <span className="ml-2 font-sans text-zinc-500">
                    · {recipientName}
                  </span>
                ) : null}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
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
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
              >
                {submitting ? "처리 중..." : "수동완료 진행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
