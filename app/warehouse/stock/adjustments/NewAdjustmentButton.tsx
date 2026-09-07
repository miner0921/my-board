"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Plus, X } from "lucide-react";
import Modal from "../../_components/Modal";
import ItemPicker, { type PickedItem } from "../ItemPicker";

// 재고 조정. 입출고와 별개 — 장부와 실물이 어긋났을 때 맞추는 정정이라 사유가 필수다.
//   품목을 고르면 그 품목의 현재 로트(소비기한별 수량)를 불러오고,
//   "변경 후" 칸을 실제 수량으로 고쳐 넣는다(증가/감소를 계산할 필요 없음).
//   장부에 없던 소비기한이 실제로 있으면 "소비기한 추가"로 줄을 만든다.
//   관리자      : 등록 즉시 반영
//   일반 작업자 : 요청만 올라가고, 관리자가 승인해야 반영된다

const TODAY = () => new Date().toISOString().slice(0, 10);

type Lot = {
  id: number | null; // null = 이번에 새로 만드는 로트
  expiry_date: string | null;
  received_date: string;
  quantity: number; // 현재 잔량
};

type Line = {
  uid: number;
  lotId: number | null;
  expiry: string;
  received: string;
  before: number;
  after: string; // 입력값
};

type Section = { item: PickedItem; lines: Line[]; loading: boolean };

let seq = 0;

export default function NewAdjustmentButton({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const close = () => {
    setOpen(false);
    setSections([]);
    setReason("");
    setError("");
    setDone("");
  };

  // 품목을 고르면 현재 로트를 불러와 줄로 편다.
  const addItem = async (item: PickedItem) => {
    setDone("");
    if (sections.some((s) => s.item.id === item.id)) return;
    setSections((prev) => [...prev, { item, lines: [], loading: true }]);
    try {
      const res = await fetch(
        `/api/warehouse/stock/lots?item_id=${item.id}`
      );
      const data = await res.json();
      const lots: Lot[] = res.ok ? (data.lots ?? []) : [];
      setSections((prev) =>
        prev.map((s) =>
          s.item.id === item.id
            ? {
                ...s,
                loading: false,
                lines: lots.map((l) => ({
                  uid: ++seq,
                  lotId: l.id,
                  expiry: l.expiry_date ?? "",
                  received: l.received_date,
                  before: Number(l.quantity),
                  after: String(l.quantity),
                })),
              }
            : s
        )
      );
      if (!res.ok) setError(data.error || "재고를 불러오지 못했습니다.");
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
      setSections((prev) =>
        prev.map((s) => (s.item.id === item.id ? { ...s, loading: false } : s))
      );
    }
  };

  const patchLine = (itemId: number, uid: number, v: Partial<Line>) =>
    setSections((prev) =>
      prev.map((s) =>
        s.item.id === itemId
          ? {
              ...s,
              lines: s.lines.map((l) => (l.uid === uid ? { ...l, ...v } : l)),
            }
          : s
      )
    );

  // 장부에 없던 소비기한 줄 추가(현재 0개 → 실제 수량으로)
  const addLot = (itemId: number) =>
    setSections((prev) =>
      prev.map((s) =>
        s.item.id === itemId
          ? {
              ...s,
              lines: [
                ...s.lines,
                {
                  uid: ++seq,
                  lotId: null,
                  expiry: "",
                  received: TODAY(),
                  before: 0,
                  after: "0",
                },
              ],
            }
          : s
      )
    );

  const removeLine = (itemId: number, uid: number) =>
    setSections((prev) =>
      prev.map((s) =>
        s.item.id === itemId
          ? { ...s, lines: s.lines.filter((l) => l.uid !== uid) }
          : s
      )
    );

  const submit = async () => {
    if (reason.trim() === "") {
      setError("조정 사유를 입력하세요.");
      return;
    }
    const payload: {
      item_id: number;
      lot_id: number | null;
      expiry_date: string | null;
      received_date: string | null;
      after_quantity: number;
    }[] = [];
    for (const s of sections) {
      for (const l of s.lines) {
        const after = Number(l.after);
        if (!Number.isInteger(after) || after < 0) {
          setError(`${s.item.name} — 변경 후 수량은 0 이상의 정수여야 합니다.`);
          return;
        }
        if (after === l.before) continue; // 안 바뀐 줄은 안 보낸다
        if (l.lotId === null && s.item.expiry_managed && !l.expiry) {
          setError(
            `${s.item.name} — 소비기한 관리 대상입니다. 소비기한을 입력하세요.`
          );
          return;
        }
        payload.push({
          item_id: s.item.id,
          lot_id: l.lotId,
          expiry_date: l.expiry || null,
          received_date: l.received || null,
          after_quantity: after,
        });
      }
    }
    if (payload.length === 0) {
      setError("바뀐 수량이 없습니다.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/stock/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, lines: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "조정 등록에 실패했습니다.");
        return;
      }
      setDone(data.message ?? "등록했습니다.");
      setSections([]);
      setReason("");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const cell =
    "w-full px-2 py-1.5 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53]"
      >
        <SlidersHorizontal size={16} strokeWidth={1.75} />
        재고 조정
      </button>

      {open && (
        <Modal open onClose={close} title="재고 조정" size="xl">
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">
              현재 재고를 불러옵니다. 실제 수량으로 고쳐 넣으면 차이만큼 조정됩니다.
              {isAdmin
                ? " 등록하면 바로 반영됩니다."
                : " 등록하면 관리자 승인 후 반영됩니다."}
            </p>

            <div>
              <p className="text-sm font-medium text-zinc-700 mb-1">품목 추가</p>
              <ItemPicker onPick={addItem} autoFocus={false} />
            </div>

            {sections.map((s) => (
              <div
                key={s.item.id}
                className="border border-zinc-200 rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-200">
                  <p className="min-w-0 flex-1 text-sm font-medium text-zinc-900 break-keep">
                    {s.item.name}
                    {s.item.expiry_managed && (
                      <span className="ml-2 text-xs font-normal text-violet-700">
                        소비기한 관리
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => addLot(s.item.id)}
                    className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 transition"
                  >
                    <Plus size={14} />
                    소비기한 추가
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSections((prev) =>
                        prev.filter((x) => x.item.id !== s.item.id)
                      )
                    }
                    className="text-zinc-400 hover:text-red-600 transition"
                    aria-label="품목 빼기"
                  >
                    <X size={16} />
                  </button>
                </div>

                {s.loading ? (
                  <p className="px-3 py-4 text-sm text-zinc-400">
                    현재 재고 불러오는 중…
                  </p>
                ) : s.lines.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-zinc-400">
                    보유 로트가 없습니다. &quot;소비기한 추가&quot;로 줄을 만드세요.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium w-40">
                          소비기한
                        </th>
                        <th className="px-3 py-2 text-left font-medium w-40">
                          입고일
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-20">
                          현재
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-24">
                          변경 후
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-16">
                          차이
                        </th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {s.lines.map((l) => {
                        const diff = Number(l.after) - l.before;
                        const isNew = l.lotId === null;
                        return (
                          <tr key={l.uid}>
                            <td className="px-3 py-2">
                              {isNew ? (
                                <input
                                  type="date"
                                  value={l.expiry}
                                  onChange={(e) =>
                                    patchLine(s.item.id, l.uid, {
                                      expiry: e.target.value,
                                    })
                                  }
                                  className={cell}
                                />
                              ) : (
                                <span className="tabular-nums text-zinc-700">
                                  {l.expiry || "없음"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isNew ? (
                                <input
                                  type="date"
                                  value={l.received}
                                  onChange={(e) =>
                                    patchLine(s.item.id, l.uid, {
                                      received: e.target.value,
                                    })
                                  }
                                  className={cell}
                                />
                              ) : (
                                <span className="tabular-nums text-zinc-400">
                                  {l.received}
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums ${
                                l.before < 0 ? "text-red-700" : "text-zinc-500"
                              }`}
                            >
                              {l.before}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={l.after}
                                onChange={(e) =>
                                  patchLine(s.item.id, l.uid, {
                                    after: e.target.value,
                                  })
                                }
                                className={`text-right tabular-nums ${cell}`}
                              />
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums font-medium ${
                                diff > 0
                                  ? "text-teal-700"
                                  : diff < 0
                                    ? "text-orange-700"
                                    : "text-zinc-300"
                              }`}
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {isNew && (
                                <button
                                  type="button"
                                  onClick={() => removeLine(s.item.id, l.uid)}
                                  className="text-zinc-400 hover:text-red-600 transition"
                                  aria-label="줄 삭제"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                조정 사유 <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="예: 9월 실사 차이 / 파손 폐기 / 전산 오등록 정정"
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-400">
                이번에 등록하는 모든 줄에 같이 붙습니다. 입출고 내역에도 남습니다.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {done && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {done}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-lg text-sm border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || sections.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
              >
                {saving ? "처리 중…" : isAdmin ? "조정 반영" : "승인 요청"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
