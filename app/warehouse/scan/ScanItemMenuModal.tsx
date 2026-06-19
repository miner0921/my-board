"use client";

import Modal from "../_components/Modal";
import { Pencil, MinusCircle } from "lucide-react";

// 완료된 상품 카드를 탭하면 뜨는 액션 메뉴.
//   - 수량 수정: 챙긴 수량을 손으로 고침 (QuantityModal 재사용)
//   - 취소: 송장에서 품목 빼기 (ExcludeItemModal 재사용)
// 두 동작 모두 기존 흐름을 그대로 호출한다(새 로직 없음).
export default function ScanItemMenuModal({
  itemName,
  onEditQty,
  onCancelItem,
  onClose,
}: {
  itemName: string;
  onEditQty: () => void;
  onCancelItem: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="완료 품목" size="md">
      <div className="space-y-4">
        <p className="text-sm font-medium text-zinc-900 break-all">{itemName}</p>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={onEditQty}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50 transition"
          >
            <Pencil size={16} strokeWidth={1.75} className="text-zinc-500" />
            수량 수정
          </button>
          <button
            type="button"
            onClick={onCancelItem}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50 transition"
          >
            <MinusCircle size={16} strokeWidth={1.75} className="text-red-500" />
            품목 전체 취소
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
