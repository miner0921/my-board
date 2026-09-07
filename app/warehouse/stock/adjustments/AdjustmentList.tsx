"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { formatDateTime } from "../../invoices/_list";

// 조정 요청 목록. 관리자면 체크해서 한 번에 승인/반려한다.
// 재고는 승인 시점에 움직인다(요청만으로는 장부가 안 바뀐다 — 049).

export type AdjustRow = {
  id: number;
  item_id: number;
  item_name: string;
  expiry_date: string | null;
  received_date: string | null;
  before_quantity: number; // 요청 당시 잔량
  after_quantity: number; // 바꾸려는 수량
  reason: string;
  status: string; // pending / approved / rejected
  requested_at: string;
  requester: string | null;
  decided_at: string | null;
  decider: string | null;
  decide_memo: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "승인 대기", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  approved: { label: "반영됨", cls: "bg-green-50 text-green-800 border-green-200" },
  rejected: { label: "반려", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export default function AdjustmentList({
  rows,
  isAdmin,
}: {
  rows: AdjustRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pendingIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
  const canDecide = isAdmin && pendingIds.length > 0;

  const decide = async (action: "approve" | "reject") => {
    if (selected.length === 0) {
      setError("처리할 요청을 선택하세요.");
      return;
    }
    if (
      action === "reject" &&
      !confirm(`${selected.length}건을 반려할까요? 재고는 바뀌지 않습니다.`)
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/stock/adjustments/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "처리에 실패했습니다.");
        return;
      }
      setNotice(data.message ?? "처리했습니다.");
      setSelected([]);
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50";

  return (
    <>
      {error && (
        <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {canDecide && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => decide("approve")}
            disabled={busy || selected.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
          >
            <Check size={16} strokeWidth={1.75} />
            승인 ({selected.length})
          </button>
          <button
            type="button"
            onClick={() => decide("reject")}
            disabled={busy || selected.length === 0}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
          >
            <X size={16} strokeWidth={1.75} />
            반려
          </button>
          <button
            type="button"
            onClick={() =>
              setSelected(
                selected.length === pendingIds.length ? [] : pendingIds
              )
            }
            className={btn}
          >
            {selected.length === pendingIds.length
              ? "선택 해제"
              : `대기 ${pendingIds.length}건 전체 선택`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto border border-zinc-200 rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              {canDecide && <th className="px-3 py-2 w-10" />}
              <th className="px-3 py-2 text-left font-medium">품목</th>
              <th className="px-3 py-2 text-left font-medium w-32">소비기한</th>
              <th className="px-3 py-2 text-right font-medium w-32">변경</th>
              <th className="px-3 py-2 text-left font-medium">사유</th>
              <th className="px-3 py-2 text-left font-medium w-44">요청</th>
              <th className="px-3 py-2 text-left font-medium w-28">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const diff = r.after_quantity - r.before_quantity;
              return (
                <tr key={r.id}>
                  {canDecide && (
                    <td className="px-3 py-2">
                      {r.status === "pending" && (
                        <input
                          type="checkbox"
                          className="w-5 h-5 align-middle"
                          aria-label={`${r.item_name} 요청 선택`}
                          checked={selected.includes(r.id)}
                          onChange={() =>
                            setSelected((prev) =>
                              prev.includes(r.id)
                                ? prev.filter((x) => x !== r.id)
                                : [...prev, r.id]
                            )
                          }
                        />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <p className="text-zinc-900 break-keep">{r.item_name}</p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-zinc-600">
                    {r.expiry_date ?? "없음"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <span className="text-zinc-400">{r.before_quantity}</span>
                    <span className="mx-1 text-zinc-300">→</span>
                    <span className="font-semibold text-zinc-900">
                      {r.after_quantity}
                    </span>
                    <span
                      className={`ml-2 text-xs font-medium ${
                        diff > 0 ? "text-teal-700" : "text-orange-700"
                      }`}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 break-keep">
                    {r.reason}
                    {r.decide_memo && (
                      <span className="block text-xs text-zinc-400">
                        처리 메모: {r.decide_memo}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {r.requester ?? "—"}
                    <span className="block text-zinc-400">
                      {formatDateTime(r.requested_at)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[11px] ${
                        STATUS[r.status]?.cls ?? "border-zinc-200 text-zinc-600"
                      }`}
                    >
                      {STATUS[r.status]?.label ?? r.status}
                    </span>
                    {r.decided_at && (
                      <span className="block text-[11px] text-zinc-400">
                        {r.decider ?? "—"} · {formatDateTime(r.decided_at)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
