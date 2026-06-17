"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import Modal from "../_components/Modal";
import UploadPanel from "./UploadPanel";

type UploadHistory = {
  id: number;
  order_filename: string | null;
  invoice_filename: string | null;
  inserted_items: number;
  inserted_invoices: number;
  skipped_invoices: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
};

// 항상 한국시간으로 표시 (환경 TZ 무관).
function formatKst(date: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

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
  const [uploads, setUploads] = useState<UploadHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [panelKey, setPanelKey] = useState(0); // 성공 후 패널 초기화용

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/warehouse/invoices/uploads");
      const data = await res.json();
      if (res.ok) setUploads(data.uploads ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // 모달 열릴 때 이력 로드
  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

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
          onSuccess={() => {
            router.refresh(); // 송장 목록 갱신
            loadHistory(); // 이력 갱신
            setPanelKey((k) => k + 1); // 패널 초기화(다음 업로드 대비)
          }}
        />

        {/* 업로드 이력 */}
        <section className="mt-6 pt-5 border-t border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">
            업로드 이력
          </h3>
          {loadingHistory ? (
            <p className="text-xs text-zinc-400">불러오는 중...</p>
          ) : uploads.length === 0 ? (
            <p className="text-xs text-zinc-400">아직 업로드 이력이 없습니다.</p>
          ) : (
            <ul className="space-y-2 max-h-52 overflow-auto">
              {uploads.map((u) => (
                <li
                  key={u.id}
                  className="flex items-start gap-2.5 text-xs border border-zinc-100 rounded-lg px-3 py-2"
                >
                  <FileSpreadsheet
                    size={15}
                    strokeWidth={1.75}
                    className="text-zinc-400 shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-zinc-700 truncate">
                        {u.invoice_filename ?? "(송장 파일명 없음)"}
                      </span>
                      <span className="text-zinc-400">·</span>
                      <span className="text-zinc-500">
                        {formatKst(u.uploaded_at)}
                      </span>
                      {u.uploaded_by_name && (
                        <span className="text-zinc-400">
                          · {u.uploaded_by_name}
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-400 mt-0.5">
                      발주서: {u.order_filename ?? "-"}
                    </div>
                    <div className="text-zinc-500 mt-0.5">
                      송장 {u.inserted_invoices}건 · 새 품목 {u.inserted_items}개
                      {u.skipped_invoices > 0 && (
                        <span className="text-amber-600">
                          {" "}
                          · 중복 SKIP {u.skipped_invoices}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Modal>
    </>
  );
}
