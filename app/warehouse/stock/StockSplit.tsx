"use client";

import { useState } from "react";

// 재고 화면 분할 뷰.
//   왼쪽 = 품목별 전체 재고 / 오른쪽 = 선택한 품목의 소비기한별 로트.
//   넓은 화면(lg~)에서는 페이지 자체는 스크롤하지 않고 좌·우 박스가 각자 스크롤한다.
//   높이의 16rem 은 셸 헤더 + 상단 버튼줄 + 검색 폼이 차지하는 몫(대략치 — 필요하면 여기만 조절).
// 로트 정렬은 서버 쿼리가 이미 선입선출(소비기한→입고일) 순으로 맞춰 보낸다.
// 화면에서 다시 정렬하지 말 것.

export type StockRow = {
  id: number;
  name: string;
  barcode: string | null;
  expiry_managed: boolean;
  total_qty: number;
  nearest_expiry: string | null;
};

export type Lot = {
  id: number;
  item_id: number;
  quantity: number;
  expiry_date: string | null; // 'YYYY-MM-DD'
  received_date: string;
  days_left: number | null; // 소비기한까지 남은 일수 (없으면 null)
};

export default function StockSplit({
  rows,
  lotsByItem,
  soonDays,
}: {
  rows: StockRow[];
  lotsByItem: Record<number, Lot[]>;
  soonDays: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 페이지를 넘겨 목록이 바뀌면 선택이 사라지므로 첫 행으로 되돌린다.
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const lots = selected ? (lotsByItem[selected.id] ?? []) : [];

  const th = "px-3 py-2 text-left font-medium";

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
      {/* 왼쪽: 품목별 전체 재고 */}
      <div className="overflow-auto border border-zinc-200 rounded-lg bg-white lg:max-h-[calc(100vh-16rem)]">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 sticky top-0 z-10">
            <tr>
              <th className={th}>품목</th>
              <th className="px-3 py-2 text-right font-medium">재고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => setSelectedId(row.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedId(row.id)}
                className={`border-t border-zinc-100 cursor-pointer ${
                  selected?.id === row.id ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <td className="px-3 py-2 font-medium text-zinc-900 break-keep">
                  {row.name}
                  {row.expiry_managed && (
                    <span className="ml-2 text-xs font-normal text-violet-700">
                      소비기한
                    </span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    row.total_qty < 0 ? "text-red-700" : "text-zinc-900"
                  }`}
                >
                  {row.total_qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 오른쪽: 선택한 품목의 소비기한별 재고 */}
      <div className="border border-zinc-200 rounded-lg bg-white overflow-auto lg:sticky lg:top-4 lg:max-h-[calc(100vh-16rem)]">
        {selected === null ? (
          <p className="px-3 py-10 text-center text-sm text-zinc-400">
            품목을 선택하세요.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 px-3 py-2 border-b border-zinc-200 bg-zinc-50 sticky top-0 z-10">
              <p className="min-w-0 flex-1 text-sm font-medium text-zinc-900 break-keep">
                {selected.name}
              </p>
              <p className="shrink-0 text-xs text-zinc-500 tabular-nums">
                총 재고 {selected.total_qty}개
              </p>
            </div>
            {lots.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-zinc-400">
                보유 로트 없음
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500 bg-white sticky top-[2.375rem] z-10">
                  <tr>
                    <th className={th}>소비기한</th>
                    <th className={th}>입고일</th>
                    <th className="px-3 py-2 text-right font-medium">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => {
                    const expired = lot.days_left !== null && lot.days_left < 0;
                    const soon =
                      lot.days_left !== null &&
                      lot.days_left >= 0 &&
                      lot.days_left <= soonDays;
                    const short = lot.quantity < 0; // 마이너스 로트 = 모자란 만큼의 기록
                    return (
                      <tr
                        key={lot.id}
                        className="border-t border-zinc-100 text-zinc-600"
                      >
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {lot.expiry_date ?? "없음"}
                          {lot.days_left !== null && (
                            <span
                              className={`ml-2 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                expired
                                  ? "bg-red-100 text-red-700"
                                  : soon
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-zinc-100 text-zinc-500"
                              }`}
                            >
                              {expired
                                ? `D+${-lot.days_left}`
                                : `D-${lot.days_left}`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-zinc-400">
                          {lot.received_date}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-medium ${
                            short ? "text-red-700" : "text-zinc-800"
                          }`}
                        >
                          {lot.quantity}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
