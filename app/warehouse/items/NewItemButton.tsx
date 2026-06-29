"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Modal from "../_components/Modal";
import ItemForm from "./ItemForm";

// 품목관리 상단 "새 품목 등록" — 페이지 이동 없이 모달로.
export default function NewItemButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium"
      >
        <Plus size={16} strokeWidth={2} />
        새 품목 등록
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="새 품목 등록" size="lg">
        <ItemForm
          mode="create"
          onSuccess={() => {
            setOpen(false);
            // 모달 닫힘 re-render가 refresh를 삼키지 않게 transition으로 분리
            // (prod 캐시 환경에서 목록 즉시 반영). 검색·정렬 URL은 유지.
            startTransition(() => router.refresh());
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
