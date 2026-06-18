"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 송장 관리자 메모 에디터 (관리자 전용).
// 작업자가 스캔 화면 "송장 안내"에서 보게 될 메모를 관리자가 입력/수정.
// 저장 시 PUT /api/warehouse/invoices/[id]/memo. 빈 값 저장 = 메모 제거.

const MAX_MEMO_LEN = 1000;

export default function InvoiceMemoEditor({
  invoiceId,
  initialMemo,
}: {
  invoiceId: number;
  initialMemo: string | null;
}) {
  const router = useRouter();
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [saved, setSaved] = useState(initialMemo ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const dirty = memo !== saved;

  const handleSave = async () => {
    setError("");
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/invoices/${invoiceId}/memo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "저장에 실패했습니다.");
        return;
      }
      const next = data.admin_memo ?? "";
      setMemo(next);
      setSaved(next);
      setDone(true);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 p-4">
      <label className="block text-sm font-medium text-zinc-700 mb-1">
        관리자 메모{" "}
        <span className="text-zinc-400 text-xs">
          (작업자가 검수 화면에서 봅니다)
        </span>
      </label>
      <textarea
        value={memo}
        onChange={(e) => {
          setMemo(e.target.value);
          setDone(false);
        }}
        rows={3}
        maxLength={MAX_MEMO_LEN}
        placeholder="예: 밀크티1kg 1개 추가 챙겨주세요"
        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-y"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-40"
        >
          {loading ? "저장 중..." : "메모 저장"}
        </button>
        <span className="text-xs text-zinc-400">
          {memo.length} / {MAX_MEMO_LEN}자
        </span>
        {done && !dirty && (
          <span className="text-xs text-green-600">저장됨</span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
