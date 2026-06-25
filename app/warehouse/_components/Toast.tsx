"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 공용 토스트(순간 알림). 화면 우상단 고정, 일정 시간 후 자동 사라짐.
//   tone: green=정상 / amber=일부제외 / red=0건 / blue=대기저장
//   표시만 — 데이터/서버 로직과 무관.
// ─────────────────────────────────────────────────────────────

export type ToastTone = "green" | "amber" | "red" | "blue";
export type ToastData = { tone: ToastTone; title: string; desc?: string };

const TONE: Record<
  ToastTone,
  { box: string; icon: typeof CheckCircle2 }
> = {
  green: { box: "bg-green-50 border-green-300 text-green-800", icon: CheckCircle2 },
  amber: { box: "bg-amber-50 border-amber-300 text-amber-900", icon: AlertTriangle },
  red: { box: "bg-red-50 border-red-300 text-red-800", icon: XCircle },
  blue: { box: "bg-blue-50 border-blue-300 text-blue-800", icon: Info },
};

// 등록/승격 결과 요약 → 토스트(색·문구) 변환. 두 곳(패널·목록)에서 공유.
export function summaryToToast(s: {
  insertedItems: number;
  insertedInvoices: number;
  skippedInvoices: number;
}): ToastData {
  if (s.insertedInvoices > 0 && s.skippedInvoices === 0) {
    return {
      tone: "green",
      title: "등록 완료되었습니다",
      desc: `송장 ${s.insertedInvoices}건 · 새 품목 ${s.insertedItems}개`,
    };
  }
  if (s.insertedInvoices > 0 && s.skippedInvoices > 0) {
    return {
      tone: "amber",
      title: "등록 완료 · 일부 제외됨",
      desc: `송장 ${s.insertedInvoices}건 등록 · 중복 ${s.skippedInvoices}건 제외`,
    };
  }
  // 등록 0건
  return {
    tone: "red",
    title: "등록된 송장이 없습니다",
    desc:
      s.skippedInvoices > 0
        ? `중복 ${s.skippedInvoices}건 전체 제외`
        : "등록할 송장이 없습니다",
  };
}

export default function Toast({
  toast,
  onClose,
  duration = 3500,
}: {
  toast: ToastData | null;
  onClose: () => void;
  duration?: number;
}) {
  // toast가 바뀔 때마다 타이머 재설정 → duration 후 자동 닫힘
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [toast, duration, onClose]);

  if (!toast) return null;
  const { box, icon: Icon } = TONE[toast.tone];

  return (
    <div className="fixed top-4 right-4 z-[60] max-w-xs">
      <div
        role="status"
        className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lg ${box}`}
      >
        <Icon size={18} strokeWidth={2} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.desc && <p className="text-xs mt-0.5 opacity-90">{toast.desc}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="ml-1 shrink-0 opacity-60 hover:opacity-100"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
