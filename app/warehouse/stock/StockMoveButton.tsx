"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, PackageMinus, Plus, X } from "lucide-react";
import Modal from "../_components/Modal";
import ItemPicker, { type PickedItem } from "./ItemPicker";

// 수동 입고 / 수동 출고 (관리자). 두 동작이 폼 대부분을 공유하므로 mode 로 분기.
//   품목을 검색해 여러 줄 담고 한 번에 등록한다(서버에서 한 트랜잭션).
//   입고 → 줄마다 소비기한(관리 품목은 필수) + 입고일 + 수량, 로트 생성
//   출고 → 줄마다 수량만. 어느 로트에서 뺄지는 서버가 소비기한 순으로 정한다.
//   메모는 이번 등록 전체에 붙는 하나(입고·출고 공통, 선택).

type Mode = "in" | "out";

const TODAY = () => new Date().toISOString().slice(0, 10);

type Line = PickedItem & {
  uid: number;
  quantity: string;
  expiry: string;
  received: string;
};

let seq = 0; // 줄 구분용(같은 품목이 소비기한별로 여러 줄일 수 있다)

export default function StockMoveButton({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const isIn = mode === "in";
  const label = isIn ? "입고" : "출고";

  const close = () => {
    setOpen(false);
    setLines([]);
    setMemo("");
    setError("");
    setDone("");
  };

  const addItem = (item: PickedItem) => {
    setLines((prev) =>
      // 같은 품목을 또 고르면 줄을 늘리지 않는다(소비기한이 다르면 "소비기한 추가"로).
      prev.some((l) => l.id === item.id)
        ? prev
        : [
            ...prev,
            {
              ...item,
              uid: ++seq,
              quantity: "1",
              expiry: "",
              received: TODAY(),
            },
          ]
    );
    setDone("");
  };

  // 같은 품목의 다른 소비기한 줄을 바로 아래에 하나 더 만든다(입고 전용).
  const addExpiryLine = (i: number) => {
    setLines((prev) => {
      const next = [...prev];
      next.splice(i + 1, 0, {
        ...prev[i],
        uid: ++seq,
        quantity: "1",
        expiry: "",
      });
      return next;
    });
  };

  const patch = (i: number, v: Partial<Line>) =>
    setLines((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...v } : x)));

  const submit = async () => {
    if (lines.length === 0) {
      setError("품목을 1개 이상 추가하세요.");
      return;
    }
    for (const l of lines) {
      const qty = Number(l.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        setError(`${l.name} — 수량은 1 이상의 정수여야 합니다.`);
        return;
      }
      if (isIn && l.expiry_managed && !l.expiry) {
        setError(`${l.name} — 소비기한 관리 대상입니다. 소비기한을 입력하세요.`);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/stock/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memo,
          items: lines.map((l) => ({
            item_id: l.id,
            quantity: Number(l.quantity),
            ...(isIn
              ? {
                  expiry_date: l.expiry || null,
                  received_date: l.received || null,
                }
              : {}),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `${label}에 실패했습니다.`);
        return;
      }
      // 연속 등록이 잦아서 모달을 닫지 않고 줄만 비운다.
      setDone(data.message ?? `${label} 완료`);
      setLines([]);
      setMemo("");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const Icon = isIn ? PackagePlus : PackageMinus;
  const cell =
    "w-full px-2 py-1.5 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
          isIn
            ? "text-white hover:opacity-90 bg-[#042C53]"
            : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
        }`}
      >
        <Icon size={16} strokeWidth={1.75} />
        {label}
      </button>

      {open && (
        <Modal open onClose={close} title={`재고 ${label}`} size="xl">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 mb-1">품목 추가</p>
              <p className="text-xs text-zinc-500 mb-2">
                {isIn
                  ? "여러 품목을 담아 한 번에 입고할 수 있습니다."
                  : "여러 품목을 담아 한 번에 출고할 수 있습니다. 소비기한이 빠른 로트부터 차감됩니다."}
              </p>
              <ItemPicker onPick={addItem} />
            </div>

            {lines.length > 0 && (
              <div className="border border-zinc-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 text-xs">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">품목</th>
                      {isIn && (
                        <>
                          <th className="text-left font-medium px-3 py-2 w-40">
                            소비기한
                          </th>
                          <th className="text-left font-medium px-3 py-2 w-40">
                            입고일
                          </th>
                        </>
                      )}
                      <th className="text-right font-medium px-3 py-2 w-24">
                        수량
                      </th>
                      <th className={isIn ? "w-20" : "w-10"} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {lines.map((l, i) => (
                      <tr key={l.uid}>
                        <td className="px-3 py-2">
                          <span className="text-zinc-900">{l.name}</span>
                          {isIn && l.expiry_managed && (
                            <span className="ml-2 text-xs text-violet-700">
                              소비기한 관리
                            </span>
                          )}
                        </td>
                        {isIn && (
                          <>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={l.expiry}
                                onChange={(e) =>
                                  patch(i, { expiry: e.target.value })
                                }
                                className={cell}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={l.received}
                                onChange={(e) =>
                                  patch(i, { received: e.target.value })
                                }
                                className={cell}
                              />
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={l.quantity}
                            onChange={(e) =>
                              patch(i, { quantity: e.target.value })
                            }
                            className={`text-right tabular-nums ${cell}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            {isIn && (
                              <button
                                type="button"
                                onClick={() => addExpiryLine(i)}
                                className="text-zinc-400 hover:text-zinc-900 transition"
                                title="같은 품목의 다른 소비기한 줄 추가"
                                aria-label="소비기한 추가"
                              >
                                <Plus size={16} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setLines((prev) =>
                                  prev.filter((_, xi) => xi !== i)
                                )
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

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                메모{" "}
                <span className="text-xs text-zinc-400 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={200}
                placeholder={isIn ? "예: A업체 9월 1일분" : "예: 파손 폐기"}
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-400">
                이번에 등록하는 모든 줄에 같이 붙습니다.
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
                disabled={saving || lines.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
              >
                {saving ? "처리 중…" : `${label} 등록`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
