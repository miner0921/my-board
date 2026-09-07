"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import Modal from "../../_components/Modal";
import ItemPicker, { type PickedItem } from "../ItemPicker";

// 입고증 작성 (관리자). 품목 + 예정 소비기한 + 예정 수량을 담는다.
//   같은 품목이 소비기한 두 종류로 들어오면 "소비기한 추가"로 줄을 하나 더 만든다.
//   현장에선 이 값이 기본으로 채워지고, 실물과 다르면 거기서 고친다.

type Line = PickedItem & { uid: number; expiry: string; planned: string };

let seq = 0; // 줄 구분용(같은 품목이 여러 줄일 수 있어 item id 로는 부족)

export default function NewReceiptButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setTitle("");
    setLines([]);
    setError("");
  };

  const addItem = (item: PickedItem) => {
    setLines((prev) =>
      // 같은 품목을 또 고르면 줄을 늘리지 않는다(소비기한이 다르면 "소비기한 추가"로).
      prev.some((l) => l.id === item.id)
        ? prev
        : [...prev, { ...item, uid: ++seq, expiry: "", planned: "1" }]
    );
  };

  // 같은 품목의 다른 소비기한 줄을 바로 아래에 하나 더 만든다.
  const addExpiryLine = (i: number) => {
    setLines((prev) => {
      const next = [...prev];
      next.splice(i + 1, 0, { ...prev[i], uid: ++seq, expiry: "", planned: "1" });
      return next;
    });
  };

  const submit = async () => {
    if (lines.length === 0) {
      setError("품목을 1개 이상 추가하세요.");
      return;
    }
    // 같은 품목+같은 소비기한이 두 줄이면 서버에서 합쳐져 화면과 달라진다 — 먼저 막는다.
    const keys = lines.map((l) => `${l.id}|${l.expiry}`);
    if (new Set(keys).size !== keys.length) {
      setError("같은 품목에 같은 소비기한인 줄이 있습니다. 소비기한을 다르게 입력하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/stock/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          items: lines.map((l) => ({
            item_id: l.id,
            expiry_date: l.expiry || null,
            planned_quantity: Number(l.planned) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "입고증 생성에 실패했습니다.");
        return;
      }
      close();
      router.push(`/warehouse/stock/receipts/${data.id}`);
      router.refresh();
    } catch (e) {
      console.error(e);
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
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53]"
      >
        <Plus size={16} strokeWidth={2} />
        입고증 작성
      </button>

      {open && (
        <Modal open onClose={close} title="입고증 작성" size="xl">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                제목{" "}
                <span className="text-xs text-zinc-400 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="예: 9월 1일 A업체 입고"
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-zinc-700 mb-1">품목 추가</p>
              <ItemPicker onPick={addItem} autoFocus={false} />
            </div>

            {lines.length > 0 && (
              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 text-xs">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">품목</th>
                      <th className="text-left font-medium px-3 py-2 w-44">
                        소비기한
                      </th>
                      <th className="text-right font-medium px-3 py-2 w-24">
                        예정 수량
                      </th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {lines.map((l, i) => (
                      <tr key={l.uid}>
                        <td className="px-3 py-2">
                          <span className="text-zinc-900">{l.name}</span>
                          {l.expiry_managed && (
                            <span className="ml-2 text-xs text-violet-700">
                              소비기한 관리
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={l.expiry}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x, xi) =>
                                  xi === i ? { ...x, expiry: e.target.value } : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={l.planned}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x, xi) =>
                                  xi === i ? { ...x, planned: e.target.value } : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 text-right border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => addExpiryLine(i)}
                              className="text-zinc-400 hover:text-zinc-900 transition"
                              title="같은 품목의 다른 소비기한 줄 추가"
                              aria-label="소비기한 추가"
                            >
                              <Plus size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLines((prev) => prev.filter((_, xi) => xi !== i))
                              }
                              className="text-zinc-400 hover:text-red-600 transition"
                              aria-label="줄 삭제"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-lg text-sm border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
              >
                {saving ? "생성 중…" : "입고증 만들기"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
