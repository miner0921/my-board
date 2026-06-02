"use client";

import { useState, type ReactNode } from "react";

type Props = {
  label: string;
  totalCount: number;
  completedCount: number;
  partialCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

// 송장 목록 날짜 그룹. 헤더 클릭으로 펼침/접힘.
// 서버 컴포넌트(page.tsx)에서 그룹마다 인스턴스 생성.
export default function InvoiceGroup({
  label,
  totalCount,
  completedCount,
  partialCount = 0,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block text-xs text-zinc-500 transition-transform ${
              open ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          <span className="font-medium text-sm text-zinc-900">{label}</span>
          <span className="text-xs text-zinc-500">
            — {totalCount}건
            {completedCount > 0 && (
              <span className="ml-1 text-green-700">
                · 완료 {completedCount}
              </span>
            )}
            {partialCount > 0 && (
              <span className="ml-1 text-amber-700">
                · 부분 {partialCount}
              </span>
            )}
          </span>
        </div>
      </button>
      {open && (
        <div className="mt-2 border border-zinc-200 rounded-lg overflow-hidden">
          {children}
        </div>
      )}
    </section>
  );
}
