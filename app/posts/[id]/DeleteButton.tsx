"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까? 댓글도 함께 삭제됩니다.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "삭제 실패");
        setLoading(false);
        return;
      }

      alert("삭제되었습니다.");
      router.push("/");
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
      className="px-4 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
    >
      {loading ? "삭제 중..." : "삭제"}
    </button>
  );
}