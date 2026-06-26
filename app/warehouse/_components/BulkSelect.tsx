"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { EyeOff, RotateCcw } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 목록 일괄 선택 → 숨김/복구 (품목·송장 공용, 관리자 전용).
//   - BulkSelectProvider: 선택 상태 컨텍스트. 목록 영역을 감싼다.
//   - BulkCheckbox: 행/카드마다 체크박스.
//   - BulkBar: 전체선택 + "선택 숨김/복구" 액션 바.
// 서버에서 렌더한 카드 사이에 끼워도 컨텍스트가 동작한다(전부 client).
// ─────────────────────────────────────────────────────────────

type Ctx = {
  selected: Set<number>;
  toggle: (id: number) => void;
  setMany: (ids: number[], on: boolean) => void;
  clear: () => void;
};

const BulkCtx = createContext<Ctx | null>(null);

export function BulkSelectProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: number[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return (
    <BulkCtx.Provider value={{ selected, toggle, setMany, clear }}>
      {children}
    </BulkCtx.Provider>
  );
}

function useBulk() {
  const ctx = useContext(BulkCtx);
  if (!ctx) throw new Error("BulkCheckbox/BulkBar must be inside BulkSelectProvider");
  return ctx;
}

export function BulkCheckbox({ id }: { id: number }) {
  const { selected, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label="선택"
      className="w-4 h-4 accent-zinc-900 cursor-pointer"
    />
  );
}

// 전체선택 체크박스(단독) — 송장 테이블 헤더 / 품목 인라인에 끼운다.
export function BulkSelectAllCheckbox({
  allIds,
  className,
}: {
  allIds: number[];
  className?: string;
}) {
  const { selected, setMany } = useBulk();
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  return (
    <input
      type="checkbox"
      checked={allChecked}
      onChange={(e) => setMany(allIds, e.target.checked)}
      aria-label="전체선택"
      className={className ?? "w-4 h-4 accent-zinc-900 cursor-pointer"}
    />
  );
}

// 전체선택 + "선택 N개" 텍스트(박스 없이) — 품목 필터 줄 밑에.
export function BulkSelectInline({ allIds }: { allIds: number[] }) {
  const { selected } = useBulk();
  return (
    <div className="mb-3 flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-sm text-zinc-600 cursor-pointer select-none">
        <BulkSelectAllCheckbox allIds={allIds} />
        전체선택
      </label>
      <span className="text-xs text-zinc-400">선택 {selected.size}개</span>
    </div>
  );
}

// 선택 삭제/복구 액션 버튼(단독) — 필터 줄 오른쪽에 둔다.
//   동작(/api/warehouse/{resource}/hide)·권한·confirm 메시지는 기존 BulkBar와 동일.
//   resource: 엔드포인트, viewDeleted=true 복구 / false 숨김(hideVerb 라벨).
export function BulkActionButton({
  resource,
  viewDeleted,
  noun,
  hideVerb = "숨김",
}: {
  resource: "items" | "invoices";
  viewDeleted: boolean;
  noun: string; // "품목" | "송장"
  hideVerb?: string;
}) {
  const { selected, clear } = useBulk();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const count = selected.size;

  const onAction = async () => {
    if (count === 0) return;
    const verb = viewDeleted ? "복구" : hideVerb;
    const msg = viewDeleted
      ? `선택한 ${count}개 ${noun}을(를) 복구할까요?`
      : `선택한 ${count}개 ${noun}을(를) ${hideVerb}할까요? (복구할 수 있습니다)`;
    if (!confirm(msg)) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/warehouse/${resource}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], restore: viewDeleted }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error ?? `${verb} 실패`);
        setSubmitting(false);
        return;
      }
      clear();
      router.refresh();
    } catch (e) {
      console.error(e);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onAction}
      disabled={count === 0 || submitting}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
        viewDeleted
          ? "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
          : "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
      }`}
    >
      {viewDeleted ? (
        <>
          <RotateCcw size={15} strokeWidth={1.75} />
          선택 복구
        </>
      ) : (
        <>
          <EyeOff size={15} strokeWidth={1.75} />
          선택 {hideVerb}
        </>
      )}
    </button>
  );
}
