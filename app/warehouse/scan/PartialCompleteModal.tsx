"use client";

import { useEffect, useRef, useState } from "react";

type ItemForReview = {
  invoice_item_id: number;
  name: string;
  quantity: number;
  scanned_count: number;
};

type Reason = "out_of_stock" | "customer_cancel" | "damaged" | "other";

type Props = {
  invoiceId: number;
  items: ItemForReview[];
  scannedQty: number;
  totalQty: number;
  onCancel: () => void;
  onCompleted: (payload: {
    completed_at: string;
    completion_reason: Reason;
    completion_note: string;
  }) => void;
};

const REASON_LABELS: Record<Reason, string> = {
  out_of_stock: "재고 부족",
  customer_cancel: "고객 취소",
  damaged: "파손",
  other: "기타",
};
const REASONS: Reason[] = [
  "out_of_stock",
  "customer_cancel",
  "damaged",
  "other",
];

// 결품 완료 모달.
// - 사유 라디오 4가지 (필수)
// - 메모 textarea (선택)
// - [확인 완료]: 사유 선택되면 활성화
// - ESC = 취소, Enter는 textarea 안에서는 줄바꿈 (preventDefault 안 함)
// - 닫히면 부모가 입력란 focus 복원
export default function PartialCompleteModal({
  invoiceId,
  items,
  scannedQty,
  totalQty,
  onCancel,
  onCompleted,
}: Props) {
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // ESC만 글로벌. Enter는 textarea/라디오 안에서 기본 동작 유지.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel, submitting]);

  // 마운트 시 [취소] 버튼에 focus (스캐너 입력이 textarea에 흘러들어가지 않도록)
  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  const trimmedNote = note.trim();
  const canSubmit = reason !== "" && !submitting;

  const progressPct =
    totalQty > 0 ? Math.round((scannedQty / totalQty) * 100) : 0;
  const filledItems = items.filter((it) => it.scanned_count >= it.quantity);
  const shortItems = items.filter((it) => it.scanned_count < it.quantity);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/scan/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          reason,
          note: trimmedNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || data?.error || "결품 완료에 실패했습니다.");
        return;
      }
      onCompleted({
        completed_at: data.invoice.completed_at,
        completion_reason: data.invoice.completion_reason,
        completion_note: data.invoice.completion_note,
      });
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 my-8">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-3xl">🟡</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-900">
              결품으로 완료
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              일부 품목만 챙기고 송장을 마감합니다. 사유와 메모는 기록에
              남습니다.
            </p>
          </div>
        </div>

        {/* 현재 진행 요약 */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-zinc-900 mb-1">
            현재 진행: {scannedQty}/{totalQty} ({progressPct}%)
          </p>
          {filledItems.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-green-700 font-medium mb-0.5">
                ✓ 챙긴 품목 {filledItems.length}건
              </p>
              <ul className="text-xs text-zinc-700 space-y-0.5 pl-3">
                {filledItems.map((it) => (
                  <li key={it.invoice_item_id} className="line-clamp-1">
                    · {it.name} ({it.scanned_count}/{it.quantity})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shortItems.length > 0 && (
            <div>
              <p className="text-[11px] text-red-700 font-medium mb-0.5">
                ⚠ 결품 품목 {shortItems.length}건
              </p>
              <ul className="text-xs text-zinc-700 space-y-0.5 pl-3">
                {shortItems.map((it) => {
                  const lack = it.quantity - it.scanned_count;
                  return (
                    <li key={it.invoice_item_id} className="line-clamp-1">
                      · {it.name} ({it.scanned_count}/{it.quantity})
                      <span className="text-red-700 ml-1">결품 {lack}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* 사유 라디오 */}
        <fieldset className="mb-4">
          <legend className="text-xs text-zinc-500 mb-2">결품 사유 (필수)</legend>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition ${
                  reason === r
                    ? "border-amber-500 bg-amber-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  disabled={submitting}
                  className="accent-amber-600"
                />
                <span className="text-zinc-800">{REASON_LABELS[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* 메모 */}
        <div className="mb-4">
          <label
            htmlFor="completion-note"
            className="block text-xs text-zinc-500 mb-1"
          >
            메모 (선택)
          </label>
          <textarea
            id="completion-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            rows={3}
            placeholder="예: 망고 1개 재고 부족"
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
            onClick={onCancel}
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
            {submitting ? "처리 중..." : "결품으로 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}
