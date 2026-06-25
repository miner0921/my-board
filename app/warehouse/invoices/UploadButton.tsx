"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Modal from "../_components/Modal";
import Toast, { type ToastData } from "../_components/Toast";
import UploadPanel from "./UploadPanel";
import BatchList from "./BatchList";

// 발주서/송장 업로드 모달 트리거. 트리거 모양은 className/children으로 주입.
export default function UploadButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panelKey, setPanelKey] = useState(0); // 성공 후 패널 초기화용
  const [batchReload, setBatchReload] = useState(0); // 목록 새로고침 신호
  const [toast, setToast] = useState<ToastData | null>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="발주서 및 송장 업로드"
        size="xl"
      >
        <UploadPanel
          key={panelKey}
          onToast={setToast}
          onSuccess={() => {
            router.refresh(); // 송장 목록 갱신
            setBatchReload((k) => k + 1); // 업로드 내역 갱신
            setPanelKey((k) => k + 1); // 패널 초기화(다음 업로드 대비)
          }}
        />

        {/* 업로드 내역 (대기/완료 · 받기 · 나머지 업로드 · 상세 보기) */}
        <BatchList
          reloadSignal={batchReload}
          onToast={setToast}
          onChanged={() => router.refresh()}
        />
      </Modal>

      {/* 결과 토스트 (우상단, 자동 사라짐) — 모달과 독립적으로 표시 */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
