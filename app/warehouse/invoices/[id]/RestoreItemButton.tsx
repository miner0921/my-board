"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

// 송장 상세에서 "제외됨" 품목을 다시 송장에 되살린다(복구).
// 완료 송장이 복구로 미완료가 되면 서버가 자동 재개(invoice_reopens) 처리.
export default function RestoreItemButton({
  invoiceId,
  invoiceItemId,
  itemName,
}: {
  invoiceId: number;
  invoiceItemId: number;
  itemName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
    if (loading) return;
    if (!confirm(`"${itemName}" 품목을 송장에 다시 포함할까요?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/warehouse/scan/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          invoice_item_id: invoiceItemId,
          action: "restore",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "복구에 실패했습니다.");
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
        onClick={handleRestore}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-50"
      >
        <RotateCcw size={13} strokeWidth={1.75} />
        {loading ? "복구 중…" : "복구"}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
