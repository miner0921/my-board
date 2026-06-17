"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "../_components/Modal";

// 수동 챙김 수량 입력 모달 (바코드 없는 품목 + 동봉).
// 챙긴 수량(절대값)을 입력 → 확정. 기본값은 필요 수량(quantity).
export default function QuantityModal({
  item,
  onConfirm,
  onClose,
}: {
  item: {
    invoice_item_id: number;
    name: string;
    quantity: number;
    scanned_count: number;
    scan_exempt?: boolean;
  };
  onConfirm: (count: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<string>(String(item.quantity));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // 열리면 입력값 전체 선택 (빠른 수정)
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onConfirm(n);
  };

  return (
    <Modal open onClose={onClose} title="수동 챙김" size="md">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">{item.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            필요 수량 {item.quantity}
            {item.scan_exempt && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-200">
                동봉
              </span>
            )}
          </p>
        </div>

        <div>
          <label className="block text-sm text-zinc-700 mb-1">챙긴 수량</label>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <p className="text-xs text-zinc-400 mt-1">
            필요 수량과 달라도 입력한 수량으로 기록됩니다.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
          >
            챙김 확인
          </button>
        </div>
      </div>
    </Modal>
  );
}
