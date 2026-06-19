"use client";

import { AlertTriangle } from "lucide-react";
import { useScannerBlockGuard } from "./useScannerBlockGuard";
import BlockedScanBanner from "./BlockedScanBanner";

type Props = {
  itemName: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  onBlockedScan: () => void;
};

// 현재 송장에 없는 품목 바코드가 스캔됐을 때 띄우는 경고 모달.
// [취소] 또는 [송장에 추가] 둘 중 선택.
//   - 취소: 그냥 닫음
//   - 송장에 추가: force=true로 재요청 → 현장 추가 처리
// ⚠️ 키보드(Enter/Esc)로는 아무것도 안 됨 — 스캐너 자동 Enter 오작동 방지.
//    확인·취소는 오직 마우스 클릭/터치로만. 스캔이 들어오면 경고만 주고 모달은 버틴다.
export default function WrongItemModal({
  itemName,
  message,
  onCancel,
  onConfirm,
  onBlockedScan,
}: Props) {
  const { blocked, containerRef } = useScannerBlockGuard(onBlockedScan);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 outline-none"
      >
        {blocked && <BlockedScanBanner />}
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle
            size={28}
            strokeWidth={1.75}
            className="shrink-0 text-amber-500 mt-0.5"
          />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-900">
              다른 송장의 품목
            </h2>
            <p className="text-sm text-zinc-600 mt-1 whitespace-pre-line">
              {message}
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-4">
          <p className="text-[11px] text-zinc-500 mb-0.5">스캔한 품목</p>
          <p className="text-sm font-medium text-zinc-900 break-all">
            {itemName}
          </p>
        </div>

        <p className="text-xs text-zinc-500 mb-4">
          이 품목을 현장에서 추가합니다. 추가된 품목은 송장 기록에
          &lsquo;현장 추가&rsquo;로 표시됩니다.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition"
          >
            송장에 추가
          </button>
        </div>
      </div>
    </div>
  );
}
