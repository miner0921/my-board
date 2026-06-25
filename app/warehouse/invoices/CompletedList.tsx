"use client";

import { useState } from "react";
import type { InvoiceListRow } from "@/lib/invoice-list";
import { BulkSelectProvider, BulkBar } from "../_components/BulkSelect";
import { InvoiceTable } from "./_list";

type Props = {
  initialRows: InvoiceListRow[];
  initialCursor: string | null;
  initialHasMore: boolean;
  // 현재 필터(q/type/from/to)를 그대로 담은 쿼리스트링. 추가 로드 API에 전달한다.
  // (tab/cursor 제외 — API는 항상 완료 탭, cursor는 여기서 붙임)
  filterQuery: string;
};

// 완료 탭 목록 — 평면(날짜 그룹 없음) + keyset "더 보기" 페이지네이션.
//   · 서버가 1페이지(100건) SSR → "더 보기"로 커서 다음 100건 fetch → 누적 append.
//   · 필터/검색은 서버 SSR + API 모두 DB 전체에 WHERE로 적용 → 로드 안 한 과거 건도
//     검색 결과에 포함되고, 그 결과를 100건씩 이어 본다.
export default function CompletedList({
  initialRows,
  initialCursor,
  initialHasMore,
  filterQuery,
}: Props) {
  const [rows, setRows] = useState<InvoiceListRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (loading || !hasMore || !cursor) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams(filterQuery);
      sp.set("cursor", cursor);
      const res = await fetch(`/api/warehouse/invoices?${sp.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "목록을 더 불러오지 못했습니다.");
        return;
      }
      setRows((prev) => [...prev, ...((data.rows as InvoiceListRow[]) ?? [])]);
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      console.error(e);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BulkSelectProvider>
      <BulkBar
        allIds={rows.map((r) => r.id)}
        resource="invoices"
        viewDeleted={false}
        noun="송장"
        hideVerb="삭제"
      />
      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        <InvoiceTable rows={rows} tab="done" selectable viewDeleted={false} />
      </div>

      {/* "더 보기" — 태블릿 친화 큰 버튼 + 현재 표시 건수 */}
      <div className="mt-5 flex flex-col items-center gap-2">
        <span className="text-xs text-zinc-400">{rows.length}건 표시 중</span>
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="w-full sm:w-auto px-10 py-3 rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-800 hover:bg-zinc-50 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        ) : (
          rows.length > 0 && (
            <span className="text-xs text-zinc-300">마지막입니다</span>
          )
        )}
      </div>
    </BulkSelectProvider>
  );
}
