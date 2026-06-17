"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MinusCircle } from "lucide-react";
import ExcludeItemModal from "../../scan/ExcludeItemModal";

// 송장 상세에서 품목을 "취소(빼기)" 한다.
// 검수 화면과 동일한 흐름: ExcludeItemModal(사유 선택) → scan/exclude API 재사용.
// (내부 API/식별자는 exclude 그대로 — 화면 문구만 "취소")
export default function ExcludeItemButton({
  invoiceId,
  invoiceItemId,
  itemName,
  quantity,
  scannedCount,
}: {
  invoiceId: number;
  invoiceItemId: number;
  itemName: string;
  quantity: number;
  scannedCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (reason: string) => {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/warehouse/scan/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          invoice_item_id: invoiceItemId,
          action: "exclude",
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "취소에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 text-zinc-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition disabled:opacity-50"
      >
        <MinusCircle size={13} strokeWidth={1.75} />
        {loading ? "취소 중…" : "취소"}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
      {open && (
        <ExcludeItemModal
          itemName={itemName}
          quantity={quantity}
          scannedCount={scannedCount}
          onCancel={() => setOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
