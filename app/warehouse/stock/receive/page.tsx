"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ScanLine, PackagePlus } from "lucide-react";
import type { ReceiptFull, ReceiptItemRow } from "@/lib/stock-receipt";
import { RECEIPT_STATUS } from "../receipts/_status";

// 현장 입고 — 입고증 바코드를 찍으면 예정 품목이 뜨고, 목록 그 자리에서 소비기한·수량을 고친다.
//   입력칸은 입고증에 적힌 예정값(소비기한·남은 수량)이 기본으로 채워져 있다.
//   등록은 줄마다가 아니라 "선택 항목 입고" / "전체 입고" 로 한 번에 한다(서버에서 한 트랜잭션).
//   상태는 서버가 자동으로 정한다 — 예정 수량을 다 채우면 입고 완료, 일부면 부분 입고.
//   (수동 "입고 완료" 버튼 없음)
//   같은 품목이 소비기한 두 종류로 왔다면: 한 번 등록 → 소비기한만 고쳐 다시 등록.
//   (서버가 소비기한별로 줄을 나눠 기록한다 — 048)
//   ?no=RC0000012 로 들어오면 바로 조회한다(입고증 상세의 "현장 입고" 링크).

const TODAY = () => new Date().toISOString().slice(0, 10);

// 줄별 입력값. 손대지 않은 칸은 입고증 값을 그대로 쓴다.
type Edit = { quantity?: string; expiry?: string; received?: string };

// 아직 안 채운 남은 예정 수량(기본 입력값).
const remainOf = (it: ReceiptItemRow) =>
  Math.max(1, it.planned_quantity - it.received_quantity);

function ReceivePage() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [data, setData] = useState<ReceiptFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [selected, setSelected] = useState<number[]>([]);

  const lookup = useCallback(async (no: string) => {
    const term = no.trim();
    if (term === "") return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/warehouse/stock/receipts/by-barcode?no=${encodeURIComponent(term)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "입고증을 불러오지 못했습니다.");
        setData(null);
        return;
      }
      setData(json as ReceiptFull);
      setEdits({});
      setSelected([]);
      setCode("");
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 링크로 넘어온 경우 자동 조회
  useEffect(() => {
    const no = searchParams.get("no");
    if (!no) return;
    // 효과 본문에서 동기 setState 를 피하려고 타이머 한 틱 뒤로 미룬다.
    const t = setTimeout(() => lookup(no), 0);
    return () => clearTimeout(t);
  }, [searchParams, lookup]);

  // 등록 후 목록을 서버 값으로 다시 맞춘다(누적 수량이 정확해야 하므로).
  const refresh = useCallback(async () => {
    if (!data) return;
    const res = await fetch(`/api/warehouse/stock/receipts/${data.receipt.id}`);
    if (res.ok) setData((await res.json()) as ReceiptFull);
  }, [data]);

  const valueOf = (it: ReceiptItemRow) => {
    const e = edits[it.id] ?? {};
    return {
      quantity: e.quantity ?? String(remainOf(it)),
      expiry: e.expiry ?? it.expiry_date ?? "",
      received: e.received ?? TODAY(),
    };
  };

  const patch = (lineId: number, v: Edit) =>
    setEdits((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...v } }));

  const toggle = (lineId: number) =>
    setSelected((prev) =>
      prev.includes(lineId)
        ? prev.filter((x) => x !== lineId)
        : [...prev, lineId]
    );

  // rows 에 담긴 줄들을 한 번에 등록한다.
  const receive = async (rows: ReceiptItemRow[]) => {
    if (!data) return;
    if (rows.length === 0) {
      setError("입고할 항목을 선택하세요.");
      return;
    }
    for (const it of rows) {
      const v = valueOf(it);
      const qty = Number(v.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        setError(`${it.name} — 수량은 1 이상의 정수여야 합니다.`);
        return;
      }
      if (it.expiry_managed && !v.expiry) {
        setError(`${it.name} — 소비기한 관리 대상입니다. 소비기한을 입력하세요.`);
        return;
      }
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/warehouse/stock/receipts/${data.receipt.id}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: rows.map((it) => {
              const v = valueOf(it);
              return {
                receipt_item_id: it.id,
                item_id: it.item_id,
                quantity: Number(v.quantity),
                expiry_date: v.expiry || null,
                received_date: v.received || null,
              };
            }),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "입고 등록에 실패했습니다.");
        return;
      }
      setNotice(json.message ?? "입고 등록 완료");
      // 등록한 줄은 입력값을 비워 서버 값(남은 수량)이 다시 채워지게 한다.
      setEdits((prev) => {
        const next = { ...prev };
        for (const it of rows) delete next[it.id];
        return next;
      });
      setSelected([]);
      await refresh();
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 전체 입고 대상 = 아직 예정 수량을 못 채운 줄. 다 채운 줄까지 또 넣지 않는다.
  const pending =
    data?.items.filter((it) => it.received_quantity < it.planned_quantity) ?? [];

  const btn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50";
  const cell =
    "w-full px-2 py-1.5 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900";

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href="/warehouse/stock/receipts" className={btn}>
          ← 입고증 목록
        </Link>
      </div>

      {/* 입고증 바코드 입력 — 스캐너는 값 끝에 Enter 를 붙여 보낸다 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(code);
        }}
        className="mb-6 flex gap-2"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="입고증 바코드를 스캔하세요"
          autoFocus
          className="flex-1 px-4 py-3 text-lg border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
        >
          <ScanLine size={18} strokeWidth={1.75} />
          조회
        </button>
      </form>

      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-xl">
          입고증 바코드를 스캔하면 예정 품목이 여기에 표시됩니다.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">
                {data.receipt.receipt_no}
                <span className="ml-2 font-normal text-zinc-500">
                  {data.receipt.title ?? "(제목 없음)"}
                </span>
              </p>
            </div>
            <span
              className={`ml-auto shrink-0 inline-block px-2 py-1 rounded border text-xs ${
                RECEIPT_STATUS[data.receipt.status]?.cls ??
                "border-zinc-200 text-zinc-600"
              }`}
            >
              {RECEIPT_STATUS[data.receipt.status]?.label ?? data.receipt.status}
            </span>
          </div>

          {/* 일괄 등록 버튼 */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                receive(data.items.filter((it) => selected.includes(it.id)))
              }
              disabled={loading || selected.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
            >
              <PackagePlus size={16} strokeWidth={1.75} />
              선택 항목 입고 ({selected.length})
            </button>
            <button
              type="button"
              onClick={() => receive(pending)}
              disabled={loading || pending.length === 0}
              className={btn}
            >
              전체 입고 ({pending.length})
            </button>
          </div>

          <div className="overflow-x-auto border border-zinc-200 rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      className="w-5 h-5 align-middle"
                      aria-label="전체 선택"
                      checked={
                        data.items.length > 0 &&
                        selected.length === data.items.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? data.items.map((it) => it.id) : []
                        )
                      }
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium">품목</th>
                  <th className="px-3 py-2 text-left font-medium w-40">
                    소비기한
                  </th>
                  <th className="px-3 py-2 text-left font-medium w-40">입고일</th>
                  <th className="px-3 py-2 text-right font-medium w-24">수량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.items.map((it) => {
                  const v = valueOf(it);
                  return (
                    <tr key={it.id}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="w-5 h-5 align-middle"
                          aria-label={`${it.name} 선택`}
                          checked={selected.includes(it.id)}
                          onChange={() => toggle(it.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-zinc-900 break-keep">{it.name}</p>
                        <p className="text-xs text-zinc-400 tabular-nums">
                          예정 {it.planned_quantity} · 입고{" "}
                          <span
                            className={
                              it.received_quantity > 0
                                ? "text-green-700 font-medium"
                                : ""
                            }
                          >
                            {it.received_quantity}
                          </span>
                          {it.expiry_managed && (
                            <span className="ml-2 text-violet-700">
                              소비기한 필수
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={v.expiry}
                          onChange={(e) =>
                            patch(it.id, { expiry: e.target.value })
                          }
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={v.received}
                          onChange={(e) =>
                            patch(it.id, { received: e.target.value })
                          }
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={v.quantity}
                          onChange={(e) =>
                            patch(it.id, { quantity: e.target.value })
                          }
                          className={`text-right tabular-nums ${cell}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReceivePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-zinc-400">불러오는 중…</div>
      }
    >
      <ReceivePage />
    </Suspense>
  );
}
