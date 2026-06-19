"use client";

import { AlertTriangle } from "lucide-react";
import { useScannerBlockGuard } from "./useScannerBlockGuard";
import BlockedScanBanner from "./BlockedScanBanner";

type Props = {
  itemName: string;
  quantity: number;
  scannedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  onBlockedScan: () => void;
};

// 이미 송장 수량만큼 챙긴 품목에 같은 바코드를 다시 찍었을 때.
// 서버가 자동으로 카운트를 증가시키지 않고 이 모달로 사용자 의도 확인.
//   - [취소]      : 닫음, 카운트 변화 없음 (오스캔 가정)
//   - [수량 추가] : force=true로 재요청 → +1 (고객 추가 요청 등 의도적 추가)
// ⚠️ 키보드(Enter/Esc)로는 아무것도 안 됨 — 스캐너 자동 Enter 오작동 방지.
//    확인·취소는 오직 마우스 클릭/터치로만. 스캔이 들어오면 경고만 주고 모달은 버틴다.
export default function OverQuantityModal({
  itemName,
  quantity,
  scannedCount,
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
              수량 초과
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              이미 수량만큼 챙긴 품목입니다.
              <br />
              추가로 더 보내려면 [수량 추가]를 누르세요.
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-5">
          <p className="text-[11px] text-zinc-500 mb-0.5">품목</p>
          <p className="text-sm font-medium text-zinc-900 break-all mb-2">
            {itemName}
          </p>
          <p className="text-xs text-zinc-600">
            현재:{" "}
            <span className="font-semibold text-zinc-900">
              {scannedCount}/{quantity}
            </span>{" "}
            (모두 스캔됨)
          </p>
        </div>

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
            수량 추가
          </button>
        </div>
      </div>
    </div>
  );
}
