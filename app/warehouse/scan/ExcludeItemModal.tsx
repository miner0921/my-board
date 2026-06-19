"use client";

import { useEffect, useRef, useState } from "react";
import { MinusCircle } from "lucide-react";

type Props = {
  itemName: string;
  quantity: number;
  scannedCount: number;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

// 검수 중 송장에서 품목을 "취소(빼기)" 할 때 확인 + 사유(선택) 입력 모달.
//   - 사유는 선택. 비워도 취소 가능. (내부 API/식별자는 exclude 그대로)
//   - 이미 챙긴 수량이 있으면 그 기록은 보존되지만 진행률에서 빠진다고 안내.
// 닫히면 부모가 입력란 focus 복원.
export default function ExcludeItemModal({
  itemName,
  quantity,
  scannedCount,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // 마운트 시 [취소]에 focus → 스캐너 입력이 사유칸/엉뚱한 곳에 안 들어가게
  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const hadProgress = scannedCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <MinusCircle
            size={28}
            strokeWidth={1.75}
            className="shrink-0 text-red-500 mt-0.5"
          />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-900">
              이 품목을 송장에서 뺄까요?
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              취소하면 진행률·완료 판정에서 빠집니다. 기록은 송장 상세에
              보존되고 나중에 복구할 수 있어요.
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4">
          <p className="text-[11px] text-zinc-500 mb-0.5">취소할 품목</p>
          <p className="text-sm font-medium text-zinc-900 break-all">
            {itemName}{" "}
            <span className="text-zinc-400 font-normal">×{quantity}</span>
          </p>
          {hadProgress && (
            <p className="text-xs text-amber-700 mt-1">
              이미 {scannedCount}개 챙김 — 이 기록은 보존되지만 진행률에서는
              빠집니다.
            </p>
          )}
        </div>

        <label className="block mb-4">
          <span className="text-xs text-zinc-500">취소 사유 (선택)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="예: 재고 부족 / 고객 취소 / 파손"
            className="mt-1 w-full text-sm px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </label>

        <div className="flex gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
          >
            닫기 (ESC)
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
