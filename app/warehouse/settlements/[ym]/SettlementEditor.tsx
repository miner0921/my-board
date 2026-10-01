"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, Save, Download } from "lucide-react";

// 정산내역서 표. 원본 엑셀과 같은 순서·같은 열이다.
//   자동 줄(회색 수량) — 업로드 원본에서 계산된 값이라 여기서 못 고친다.
//   수동 줄           — 단가·수량·항목명·비고를 직접 넣는다.
// 합계는 저장 전에도 화면에서 바로 다시 계산된다(서버 계산식과 같은 식).

export type EditorLine = {
  id: number;
  section: string;
  name: string;
  note: string;
  unitPrice: number;
  qty: number | null;
  auto: boolean;
  missing: boolean;
  sourceText: string;
};

type Draft = { name: string; note: string; unitPrice: string; qty: string };

const money = (n: number) => Math.round(n).toLocaleString("ko-KR");

// 수량이 null 인 줄('-')은 단가가 곧 금액 — lib/settlement.ts 의 lineAmount 와 같은 규칙
const amountOf = (unitPrice: number, qty: number | null) =>
  qty === null ? unitPrice : unitPrice * qty;

export default function SettlementEditor({
  ym,
  confirmed,
  confirmedBy,
  sections,
  lines,
}: {
  ym: string;
  confirmed: boolean;
  confirmedBy: string | null;
  sections: { key: string; label: string }[];
  lines: EditorLine[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          name: l.name,
          note: l.note,
          unitPrice: String(l.unitPrice),
          qty: l.auto || l.qty === null ? "" : String(l.qty),
        },
      ])
    )
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const patch = (id: number, key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
    setDirty(true);
    setSaved(false);
  };

  // 화면 표시용으로 각 줄의 수량/금액을 다시 계산
  const computed = useMemo(() => {
    const byLine = new Map<number, { qty: number | null; amount: number; unitPrice: number }>();
    const totals: Record<string, number> = {};
    for (const l of lines) {
      const d = draft[l.id];
      const unitPrice = Number(d.unitPrice) || 0;
      // 자동 줄의 수량은 서버가 준 값 그대로. 수동 줄은 빈 칸이면 '-'(단가가 곧 금액).
      const qty = l.auto ? l.qty : d.qty.trim() === "" ? null : Number(d.qty) || 0;
      const amount = amountOf(unitPrice, qty);
      byLine.set(l.id, { qty, amount, unitPrice });
      totals[l.section] = (totals[l.section] ?? 0) + amount;
    }
    const grand = Object.values(totals).reduce((a, b) => a + b, 0);
    return { byLine, totals, grand };
  }, [draft, lines]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/settlements/${ym}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => {
            const d = draft[l.id];
            return {
              id: l.id,
              name: d.name,
              note: d.note,
              unit_price: Number(d.unitPrice) || 0,
              qty: d.qty.trim() === "" ? null : Number(d.qty) || 0,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const toggleConfirm = async () => {
    if (busy) return;
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 그대로 진행할까요?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/settlements/${ym}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: !confirmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "처리하지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const cellInput =
    "w-full px-2 py-1 border border-transparent rounded hover:border-zinc-300 focus:border-zinc-400 focus:outline-none bg-transparent";

  return (
    <div>
      <div className="overflow-x-auto border border-zinc-200 rounded-xl">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium w-28">구 분</th>
              <th className="px-3 py-2 font-medium w-36">세부항목</th>
              <th className="px-3 py-2 font-medium">비 고</th>
              <th className="px-3 py-2 font-medium text-right w-32">단가 (VAT 포함)</th>
              <th className="px-3 py-2 font-medium text-right w-28">수 량</th>
              <th className="px-3 py-2 font-medium text-right w-36">합 계</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const rows = lines.filter((l) => l.section === sec.key);
              if (rows.length === 0) return null;
              return (
                <SectionRows
                  key={sec.key}
                  label={sec.label}
                  rows={rows}
                  draft={draft}
                  computed={computed}
                  confirmed={confirmed}
                  patch={patch}
                  cellInput={cellInput}
                />
              );
            })}
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-medium">
              <td className="px-3 py-3" colSpan={4} />
              <td className="px-3 py-3 text-right">당월 계</td>
              <td className="px-3 py-3 text-right tabular-nums text-base">
                {money(computed.grand)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!confirmed && (
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
          >
            <Save size={16} strokeWidth={1.75} />
            {busy ? "저장 중…" : saved ? "저장됨" : "저장"}
          </button>
        )}
        <a
          href={`/api/warehouse/settlements/${ym}/export`}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
        >
          <Download size={16} strokeWidth={1.75} />
          엑셀 내보내기
        </a>
        <button
          type="button"
          onClick={toggleConfirm}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50"
        >
          {confirmed ? (
            <>
              <LockOpen size={16} strokeWidth={1.75} />
              확정 해제
            </>
          ) : (
            <>
              <Lock size={16} strokeWidth={1.75} />
              확정
            </>
          )}
        </button>
      </div>

      {confirmed && (
        <p className="mt-2 text-xs text-zinc-500">
          확정됨{confirmedBy ? ` · ${confirmedBy}` : ""} — 수정하려면 확정을 해제하세요.
        </p>
      )}
    </div>
  );
}

function SectionRows({
  label,
  rows,
  draft,
  computed,
  confirmed,
  patch,
  cellInput,
}: {
  label: string;
  rows: EditorLine[];
  draft: Record<number, Draft>;
  computed: {
    byLine: Map<number, { qty: number | null; amount: number; unitPrice: number }>;
    totals: Record<string, number>;
  };
  confirmed: boolean;
  patch: (id: number, key: keyof Draft, value: string) => void;
  cellInput: string;
}) {
  return (
    <>
      {rows.map((l, i) => {
        const d = draft[l.id];
        const c = computed.byLine.get(l.id)!;
        return (
          <tr key={l.id} className="border-t border-zinc-100">
            <td className="px-3 py-1.5 text-zinc-600 align-middle">
              {i === 0 ? label : ""}
            </td>
            <td className="px-3 py-1.5">
              {confirmed ? (
                l.name
              ) : (
                <input
                  value={d.name}
                  onChange={(e) => patch(l.id, "name", e.target.value)}
                  className={cellInput}
                />
              )}
            </td>
            <td className="px-3 py-1.5 text-zinc-600">
              {confirmed ? (
                l.note
              ) : (
                <input
                  value={d.note}
                  onChange={(e) => patch(l.id, "note", e.target.value)}
                  className={cellInput}
                />
              )}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {confirmed ? (
                money(c.unitPrice)
              ) : (
                <input
                  value={d.unitPrice}
                  onChange={(e) => patch(l.id, "unitPrice", e.target.value)}
                  inputMode="decimal"
                  className={`${cellInput} text-right tabular-nums`}
                />
              )}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {l.auto ? (
                // 자동 수량 — 업로드 원본에서 온 값이라 읽기 전용
                <span
                  className={l.missing ? "text-amber-600" : "text-zinc-500"}
                  title={l.missing ? `원본에서 '${l.sourceText}' 를 찾지 못했습니다` : l.sourceText}
                >
                  {l.missing ? "미확인" : (l.qty ?? 0).toLocaleString("ko-KR")}
                </span>
              ) : confirmed ? (
                c.qty === null ? "-" : c.qty.toLocaleString("ko-KR")
              ) : (
                <input
                  value={d.qty}
                  onChange={(e) => patch(l.id, "qty", e.target.value)}
                  inputMode="decimal"
                  placeholder="-"
                  className={`${cellInput} text-right tabular-nums`}
                />
              )}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{money(c.amount)}</td>
          </tr>
        );
      })}
      <tr className="border-t border-zinc-200 bg-zinc-50/70">
        <td className="px-3 py-2" colSpan={4} />
        <td className="px-3 py-2 text-right text-zinc-600">합 계</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium">
          {money(computed.totals[rows[0].section] ?? 0)}
        </td>
      </tr>
    </>
  );
}
