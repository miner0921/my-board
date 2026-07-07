"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { EyeOff, RotateCcw, CheckCheck } from "lucide-react";

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

// 대기 탭 다중선택 → "수동완료"(스캔 없이 완료 처리) 버튼 + 확인 모달.
//   API: POST /api/warehouse/invoices/manual-complete  body { ids }.
//   ★ Enter 자동 확정 방지: confirm() 대신 커스텀 모달을 쓰고 Enter 핸들러를 걸지
//     않는다(물리적 클릭만). 마운트 시 [취소]에 focus, ESC로만 닫힘.
//     (ReopenButton 모달과 동일한 방식 — 스캐너 Enter 오작동 이력 대응.)
//   ※ 배치 위치(대기 탭에서만 노출)는 호출 측 page.tsx에서 결정한다.
export function InvoiceManualCompleteBulkButton() {
  const { selected, clear } = useBulk();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const count = selected.size;

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, submitting]);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setError("");
  };

  const handleSubmit = async () => {
    if (submitting || count === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/invoices/manual-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "수동완료에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      const completed: number = data?.completed ?? 0;
      const skippedCount: number = Array.isArray(data?.skipped)
        ? data.skipped.length
        : 0;
      const msg =
        skippedCount > 0
          ? `${completed}건 수동완료 완료. ${skippedCount}건은 이미 처리되어 건너뜀.`
          : `${completed}건 수동완료 완료.`;
      setOpen(false);
      alert(msg);
      clear();
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={count === 0}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
      >
        <CheckCheck size={15} strokeWidth={1.75} />
        수동완료
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 my-8">
            <div className="flex items-start gap-3 mb-4">
              <CheckCheck
                size={28}
                strokeWidth={1.75}
                className="shrink-0 text-purple-600 mt-0.5"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  수동완료
                </h2>
                <p className="text-sm text-zinc-600 mt-1">
                  선택한 {count}건을 수동완료 처리합니다. 계속하시겠습니까?
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
              >
                취소 (ESC)
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
              >
                {submitting ? "처리 중..." : "수동완료 진행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
