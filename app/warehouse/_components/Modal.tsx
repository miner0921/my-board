"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 공용 모달(팝업) 컴포넌트.
//   - 품목 등록/수정, 송장 업로드 등에서 재사용 (복붙 방지).
//   - 백드롭 클릭 / ESC 로 닫힘, 열려 있는 동안 바디 스크롤 잠금.
//   - size: 내용 양에 따라 너비 선택.
// ─────────────────────────────────────────────────────────────

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
};

const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "lg",
}: ModalProps) {
  // ESC 닫기 + 바디 스크롤 잠금 (열려 있을 때만)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`my-4 w-full ${SIZE_CLASS[size]} rounded-2xl bg-white shadow-xl`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 p-1.5 text-zinc-400 hover:text-zinc-900"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        {/* 본문 */}
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
