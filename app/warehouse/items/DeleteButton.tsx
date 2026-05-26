"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("정말 이 품목을 삭제하시겠습니까?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/items/${itemId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "삭제 실패");
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
