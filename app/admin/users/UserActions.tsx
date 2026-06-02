"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  userId: number;
  role: "user" | "admin";
  isActive: boolean;
  isSelf: boolean;
};

// 행별 액션: 권한 토글 / 활성화 토글.
// 본인이면 둘 다 disabled + "본인" 라벨.
export default function UserActions({
  userId,
  role,
  isActive,
  isSelf,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (isSelf) {
    return (
      <span className="text-xs text-zinc-400 italic">본인</span>
    );
  }

  const toggleRole = async () => {
    const nextRole = role === "admin" ? "user" : "admin";
    if (
      !confirm(
        nextRole === "admin"
          ? "이 사용자를 관리자로 승격할까요?"
          : "이 사용자의 관리자 권한을 해제할까요?"
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "변경 실패");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async () => {
    if (
      !confirm(
        isActive
          ? "이 계정을 비활성화할까요? 로그인이 차단됩니다."
          : "이 계정을 다시 활성화할까요?"
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "변경 실패");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={toggleRole}
        disabled={loading}
        className="px-2 py-1 text-xs border border-zinc-300 rounded hover:bg-zinc-50 transition disabled:opacity-50"
      >
        {role === "admin" ? "일반으로" : "관리자로"}
      </button>
      <button
        type="button"
        onClick={toggleActive}
        disabled={loading}
        className={`px-2 py-1 text-xs border rounded transition disabled:opacity-50 ${
          isActive
            ? "border-red-300 text-red-700 hover:bg-red-50"
            : "border-green-300 text-green-700 hover:bg-green-50"
        }`}
      >
        {isActive ? "비활성화" : "활성화"}
      </button>
    </div>
  );
}
