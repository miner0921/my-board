"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

type Props = {
  invoiceId: number;
  currentNo: string;
};

// 송장번호 편집 버튼(펜) + 확인 모달.
// API: PUT /api/warehouse/invoices/[id]/invoice-no  body { new_no }.
//
// ★ Enter 자동 확정 방지: 스캐너 Enter로 모달이 자동 승인되던 이력 때문에
//   Enter 핸들러를 걸지 않고(모달·입력칸 모두 form 밖이라 Enter 제출 없음),
//   마운트 시 [취소]에 focus, ESC로만 닫힌다. "변경"은 물리 클릭으로만 실행.
//   (ReopenButton / ManualCompleteButton 모달과 동일 방식.)
export default function EditInvoiceNoButton({ invoiceId, currentNo }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    // 스캐너 우발 입력이 확인으로 흘러들지 않도록 [취소]에 focus(입력칸 아님).
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
    setValue("");
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const newNo = value.trim();
    if (newNo.length === 0) {
      setError("송장번호를 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/warehouse/invoices/${invoiceId}/invoice-no`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_no: newNo }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        // 중복(409)·빈값/길이(400)·없음(404) 등 → 모달 유지하고 에러 표시.
        setError(data?.error || "변경에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      if (data?.changed === false) {
        // 같은 값 — 변경 없음. 모달 유지하고 안내를 에러 자리에 표시(중복과 동일 방식).
        setError(data?.message || "변경 사항이 없습니다.");
        setSubmitting(false);
        return;
      }
      // 성공(변경됨) — 모달 닫고 새로고침(새 번호 + 변경 이력 반영).
      setOpen(false);
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
        aria-label="송장번호 변경"
        className="shrink-0 inline-flex items-center justify-center p-1 text-zinc-400 hover:text-zinc-600 transition"
      >
        <Pencil size={14} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 my-8">
            <div className="flex items-start gap-3 mb-4">
              <Pencil
                size={26}
                strokeWidth={1.75}
                className="shrink-0 text-zinc-700 mt-0.5"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  송장번호 변경
                </h2>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4">
              <p className="text-[11px] text-zinc-500 mb-0.5">현재 번호</p>
              <p className="text-sm font-mono text-zinc-900 break-all">
                {currentNo}
              </p>
            </div>

            <div className="mb-4">
              <label
                htmlFor="new-invoice-no"
                className="block text-xs text-zinc-500 mb-1"
              >
                새 송장번호
              </label>
              <input
                id="new-invoice-no"
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={submitting}
                maxLength={100}
                autoComplete="off"
                placeholder="새 송장번호 입력"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
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
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
              >
                {submitting ? "처리 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
