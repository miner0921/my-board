"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

type Props = {
  invoiceId: number;
  invoiceNo: string;
  scannedQty: number;
  totalQty: number;
};

// 완료/부분완료 송장을 다시 검수 가능 상태로 되돌리는 버튼 + 모달.
// 한 곳에서만 쓰이므로 한 파일로 통합.
//
// 성공 시 /warehouse/scan으로 이동 — 작업자가 송장 바코드를
// 다시 스캔해 단일 입력란 흐름으로 자연스럽게 재개.
//
// 재개 사유는 선택사항. 빈 값으로 보내도 진행 가능 (서버가 NULL로 저장).
export default function ReopenButton({
  invoiceId,
  invoiceNo,
  scannedQty,
  totalQty,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  const trimmed = reason.trim();
  const canSubmit = !submitting;

  useEffect(() => {
    if (!open) return;
    // 마운트 시 [취소]에 focus. textarea가 아니라 버튼에 두는 이유는
    // 스캐너가 발생시킬 수 있는 우연한 키 입력이 textarea로 흘러들지 않게 하기 위함.
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
    setReason("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/warehouse/invoices/${invoiceId}/reopen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: trimmed }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || data?.error || "재개에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      // 검수 페이지로 이동 (단일 입력란에서 송장 바코드 다시 스캔)
      router.push("/warehouse/scan");
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
        className="flex items-center justify-center gap-1.5 w-full py-3 rounded-lg text-sm font-medium border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
      >
        <RefreshCw size={16} strokeWidth={1.75} />
        검수 재개
      </button>
      <p className="text-[11px] text-zinc-400 text-center mt-2">
        배송 전 추가/수정 요청이 있을 때 사용하세요. 재개 이력은 영구
        기록됩니다.
      </p>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 my-8">
            <div className="flex items-start gap-3 mb-4">
              <RefreshCw
                size={28}
                strokeWidth={1.75}
                className="shrink-0 text-amber-600 mt-0.5"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  검수 재개
                </h2>
                <p className="text-sm text-zinc-600 mt-1">
                  이 송장을 다시 검수 가능 상태로 만듭니다.
                  <br />
                  <span className="text-xs text-zinc-500">
                    현재 진행률({scannedQty}/{totalQty})은 보존되며,
                    재개 이력은 영구 기록됩니다.
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
                htmlFor="reopen-reason"
                className="block text-xs text-zinc-500 mb-1"
              >
                재개 사유 (선택)
              </label>
              <textarea
                id="reopen-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                rows={3}
                placeholder="예: 망고 1개 추가 요청"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              />
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
                disabled={!canSubmit}
                className="flex-1 py-3 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
              >
                {submitting ? "처리 중..." : "재개 진행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
