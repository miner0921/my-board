"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Modal from "../_components/Modal";

// 정산 월 추가. 항목 구성과 단가는 직전 월에서 복사되고(없으면 기본 템플릿),
// 수량은 비어 있는 상태로 시작한다.

function defaultYm() {
  // 정산은 보통 지난달 것을 만든다
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function NewMonthButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(defaultYm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ym }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "정산 월을 만들지 못했습니다.");
        return;
      }
      setOpen(false);
      router.push(`/warehouse/settlements/${ym}`);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition"
      >
        <Plus size={16} strokeWidth={2} />
        정산 월 추가
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="정산 월 추가" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-600 mb-1.5">정산 월</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              직전 월이 있으면 항목·단가를 그대로 가져옵니다. 수량은 비어 있습니다.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || !ym}
              className="px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {saving ? "만드는 중…" : "만들기"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
