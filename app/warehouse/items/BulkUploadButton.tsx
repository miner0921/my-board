"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import Modal from "../_components/Modal";
import BulkUploadPanel from "./BulkUploadPanel";

// 품목관리 "CSV/엑셀 대량 등록" — 페이지 이동 없이 모달로.
export default function BulkUploadButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
      >
        <Upload size={16} strokeWidth={1.75} />
        대량 등록
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="품목 대량 등록 (엑셀/CSV)"
        size="xl"
      >
        <BulkUploadPanel onSuccess={() => router.refresh()} />
      </Modal>
    </>
  );
}
