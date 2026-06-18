"use client";

import { useEffect, useState } from "react";
import Modal from "../_components/Modal";
import BarcodeTag from "../_components/BarcodeTag";

// 품목 검색 → 현장 추가 모달.
//   - 품명/바코드/품목코드로 검색(GET /api/warehouse/items?q=).
//   - 선택 시 POST /api/warehouse/scan/add 로 송장에 추가.
//   - 추가 결과는 onAdded 로 부모에 전달(카드 upsert + 바코드 없으면 수량 모달 자동 오픈).

type SearchItem = {
  id: number;
  name: string;
  barcode: string | null;
  has_image: boolean;
};

// /scan/add 응답 (부모가 카드 upsert에 사용)
export type AddResult = {
  outcome: "added" | "restored" | "already_present";
  item: {
    invoice_item_id: number;
    item_id: number;
    name: string;
    display_name: string;
    quantity: number;
    scanned_count: number;
    barcode: string | null;
    updated_at: string;
    has_image: boolean;
    scan_exempt: boolean;
    is_added_on_scan: boolean;
  };
  invoice: {
    id: number;
    status: string;
    scanned_qty: number;
    total_qty: number;
  };
};

// 모달은 "열릴 때만 마운트"한다(부모에서 조건부 렌더) — 매번 새 인스턴스라
// 리셋용 effect 없이 초기 상태로 시작.
export default function AddItemModal({
  onClose,
  invoiceId,
  existingItemIds,
  onAdded,
}: {
  onClose: () => void;
  invoiceId: number;
  existingItemIds: Set<number>;
  onAdded: (result: AddResult) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // 디바운스 검색 — setState는 타이머/async 콜백 안에서만(효과 본문 동기 setState 회피).
  // 빈 검색어는 fetch 안 함(렌더에서 안내 문구 분기).
  useEffect(() => {
    const query = q.trim();
    if (query === "") return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/warehouse/items?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "검색에 실패했습니다.");
          setResults([]);
        } else {
          setError("");
          setResults((data.items ?? []).slice(0, 30));
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const handleAdd = async (itemId: number) => {
    setError("");
    setAddingId(itemId);
    try {
      const res = await fetch("/api/warehouse/scan/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, item_id: itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "추가에 실패했습니다.");
        return;
      }
      onAdded(data as AddResult);
      onClose();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="품목 추가 (검색)" size="lg">
      <p className="text-sm text-zinc-500 mb-3">
        바코드가 없거나 송장에 없는 품목을 검색해 추가합니다. 추가 후 수량은 수동
        챙김으로 확인합니다.
      </p>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="품명·바코드·품목코드로 검색"
        className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 max-h-[50vh] overflow-y-auto divide-y divide-zinc-100 border border-zinc-100 rounded-lg">
        {q.trim() === "" ? (
          <p className="text-sm text-zinc-400 text-center py-8">
            검색어를 입력하세요.
          </p>
        ) : searching ? (
          <p className="text-sm text-zinc-400 text-center py-8">검색 중...</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-8">
            검색 결과가 없습니다.
          </p>
        ) : (
          results.map((it) => {
            const inInvoice = existingItemIds.has(it.id);
            return (
              <div
                key={it.id}
                className="flex items-center gap-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-900 truncate">{it.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <BarcodeTag barcode={it.barcode} />
                    {inInvoice && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-200">
                        송장에 있음
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(it.id)}
                  disabled={addingId !== null}
                  className="shrink-0 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-40"
                >
                  {addingId === it.id ? "추가 중..." : "추가"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
