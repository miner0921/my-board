"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../_components/Modal";
import ItemForm from "./ItemForm";

// 품목 카드의 "수정" — 페이지 이동 없이 모달로.
// 모달이 열릴 때 ItemForm(edit)이 마운트되며 GET 으로 최신값을 불러온다.
export default function EditItemButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 text-center px-2 py-1 text-[11px] border border-zinc-300 rounded hover:bg-zinc-50 transition"
      >
        수정
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="품목 수정" size="lg">
        <ItemForm
          mode="edit"
          itemId={itemId}
          onSuccess={() => {
            setOpen(false);
            router.refresh(); // 목록만 갱신 (검색·정렬 URL 유지 → 1번 문제 해결)
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
