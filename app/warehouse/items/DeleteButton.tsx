"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";

// variant="row"(기본): 텍스트 버튼 / variant="icon": 이미지 위 오버레이 아이콘.
export default function DeleteButton({
  itemId,
  variant = "row",
}: {
  itemId: number;
  variant?: "row" | "icon";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("이 품목을 숨길까요? (목록에서 감춰지며 복구할 수 있습니다)")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/items/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [itemId] }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "숨김 실패");
        setLoading(false);
        return;
      }

      router.refresh();
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        onClick={handleDelete}
        disabled={loading}
        aria-label="삭제"
        title="삭제"
        className="w-[25px] h-[25px] flex items-center justify-center rounded-md bg-white/90 border border-red-300 text-red-600 shadow-sm transition hover:bg-red-50 active:bg-red-100 active:scale-95 disabled:opacity-50"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-2 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition disabled:opacity-50"
    >
      {loading ? "..." : "삭제"}
    </button>
  );
}
