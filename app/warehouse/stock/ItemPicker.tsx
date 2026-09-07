"use client";

import { useEffect, useState } from "react";

// 품목 검색 → 선택. 재고 입고/출고 모달과 입고증 작성 모달이 같이 쓴다.
// 검색은 기존 품목 API(GET /api/warehouse/items?q=)를 그대로 재사용한다.

export type PickedItem = {
  id: number;
  name: string;
  barcode: string | null;
  expiry_managed: boolean;
};

export default function ItemPicker({
  onPick,
  placeholder = "품목명·바코드로 검색",
  autoFocus = true,
}: {
  onPick: (item: PickedItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // 디바운스 검색 — setState는 타이머/async 콜백 안에서만.
  useEffect(() => {
    const term = q.trim();
    // 빈 검색어는 fetch 안 함. 렌더에서 안내 문구로 분기하므로 결과를 비울 필요도 없다.
    if (term === "") return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/warehouse/items?q=${encodeURIComponent(term)}`
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

  return (
    <div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-2 max-h-64 overflow-y-auto">
        {q.trim() === "" ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            품목명이나 바코드를 입력하세요.
          </p>
        ) : searching ? (
          <p className="py-6 text-center text-sm text-zinc-400">검색 중…</p>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            검색 결과가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {results.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onPick(it)}
                  className="w-full text-left px-2 py-2.5 hover:bg-zinc-50 rounded-md transition"
                >
                  <span className="block text-sm text-zinc-900">{it.name}</span>
                  <span className="block text-xs text-zinc-400">
                    {it.barcode ?? "바코드 없음"}
                    {it.expiry_managed && (
                      <span className="ml-2 text-violet-700">소비기한 관리</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
