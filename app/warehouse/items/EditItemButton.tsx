"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "../_components/Modal";
import ItemForm from "./ItemForm";

// 품목 카드의 "수정" — 페이지 이동 없이 모달로.
// 모달이 열릴 때 ItemForm(edit)이 마운트되며 GET 으로 최신값을 불러온다.
export default function EditItemButton({
  itemId,
  isAdmin = false,
}: {
  itemId: number;
  isAdmin?: boolean;
}) {
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
          isAdmin={isAdmin}
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
