"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import WrongItemModal from "./WrongItemModal";
import InvoiceChangeModal from "./InvoiceChangeModal";
import PartialCompleteModal from "./PartialCompleteModal";
import CancelInvoiceModal from "./CancelInvoiceModal";
import OverQuantityModal from "./OverQuantityModal";
import {
  beepComplete,
  beepError,
  beepSuccess,
  initAudio,
  vibrate,
} from "@/lib/feedback";

// ─────────────────────────────────────────────────────────────
// 단일 입력란 구조의 검수 화면.
//   - 송장/품목 구분 없이 한 입력란에서 모든 바코드 스캔
//   - 서버가 바코드 종류 판별 (POST /api/warehouse/scan)
//   - 응답 type에 따라 화면/사운드/진동/모달 처리
// ─────────────────────────────────────────────────────────────

type InvoicePayload = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  status: string;
  sender_name: string | null;
  customer_type: string | null;
  delivery_note: string | null;
  recipient_postal_code: string | null;
  recipient_name_masked: string;
  recipient_phone_masked: string;
  recipient_address_masked: string;
  total_qty: number;
  scanned_qty: number;
};

type ItemPayload = {
  invoice_item_id: number;
  item_id: number;
  quantity: number;
  scanned_count: number;
  display_name: string | null;
  name: string;
  barcode: string | null;
  has_image: boolean;
  updated_at: string;
  is_added_on_scan?: boolean;
};

type FlashKind = "ok" | "error" | "complete" | "partial" | null;

type WrongItemState = {
  itemName: string;
  message: string;
  pendingBarcode: string;
} | null;

type OverQuantityState = {
  itemName: string;
  quantity: number;
  scannedCount: number;
  pendingBarcode: string;
} | null;

type InvoiceChangeState = {
  currentInvoice: {
    id: number;
    invoice_no: string;
    scanned_qty: number;
    total_qty: number;
  };
  nextInvoice: { id: number; invoice_no: string };
  pendingBarcode: string;
} | null;

type CompleteBanner =
  | { kind: "full"; invoice_no: string }
  | { kind: "partial"; invoice_no: string; reason: string; note: string }
  | null;

function customerTypeBadge(type: string | null) {
  if (type === "business") return <Badge tone="blue">사업자</Badge>;
  if (type === "individual") return <Badge tone="green">개인</Badge>;
  if (type === "retail") return <Badge tone="purple">소매</Badge>;
  return null;
}

function Badge({
  tone,
  children,
}: {
  tone: "blue" | "green" | "purple" | "amber" | "zinc" | "red";
  children: React.ReactNode;
}) {
  const cls = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    zinc: "bg-zinc-50 text-zinc-600 border-zinc-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[tone];
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${cls}`}>
      {children}
    </span>
  );
}

const REASON_LABEL: Record<string, string> = {
  out_of_stock: "재고 부족",
  customer_cancel: "고객 취소",
  damaged: "파손",
  other: "기타",
  full: "정상 완료",
};

export default function ScanPage() {
  const [invoice, setInvoice] = useState<InvoicePayload | null>(null);
  const [items, setItems] = useState<ItemPayload[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [statusMsg, setStatusMsg] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"ok" | "error" | "info">(
    "info"
  );
  const [flash, setFlash] = useState<FlashKind>(null);
  const [lastScannedId, setLastScannedId] = useState<number | null>(null);

  // 모달 상태
  const [wrongItem, setWrongItem] = useState<WrongItemState>(null);
  const [overQty, setOverQty] = useState<OverQuantityState>(null);
  const [invoiceChange, setInvoiceChange] = useState<InvoiceChangeState>(null);
  const [partialOpen, setPartialOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // 완료 배너 (자동 사라지지 않음 — 새 송장 진입할 때만 해제)
  const [completeBanner, setCompleteBanner] = useState<CompleteBanner>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modalOpen =
    wrongItem !== null ||
    overQty !== null ||
    invoiceChange !== null ||
    partialOpen ||
    cancelOpen;

  // 송장이 완료/부분완료 상태면 "세션 끝" — 품목 스캔은 서버에서 자연스럽게
  // scan_no_invoice로 처리되도록 current_invoice_id=null로 보냄.
  const isSessionDone =
    invoice !== null &&
    (invoice.status === "completed" || invoice.status === "completed_partial");

  const resetAndFocus = useCallback(() => {
    setInput("");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!modalOpen) inputRef.current?.focus();
  }, [invoice, modalOpen]);

  useEffect(() => {
    if (!modalOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [modalOpen]);

  const triggerFlash = (kind: FlashKind) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(kind);
    if (kind !== "complete" && kind !== "partial") {
      flashTimerRef.current = setTimeout(() => setFlash(null), 350);
    }
  };

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const updateItemCount = (invoiceItemId: number, newCount: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.invoice_item_id === invoiceItemId
          ? { ...it, scanned_count: newCount }
          : it
      )
    );
    setLastScannedId(invoiceItemId);
  };

  const addItem = (newItem: ItemPayload) => {
    setItems((prev) => [...prev, newItem]);
    setLastScannedId(newItem.invoice_item_id);
  };

  // ── 핵심: 바코드 스캔 처리 ───────────────────────────────
  const sendScan = async (
    barcode: string,
    opts: { force?: boolean } = {}
  ) => {
    const value = barcode.trim();
    if (!value) return;

    setLoading(true);
    try {
      // 완료 송장이라도 그대로 current_invoice_id를 보낸다.
      // 서버가 자동 재개 흐름(OverQuantityModal → force=true → status='pending')으로 처리.
      const currentId = invoice?.id ?? null;

      const res = await fetch("/api/warehouse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: value,
          current_invoice_id: currentId,
          force: opts.force === true,
        }),
      });
      const data = await res.json();

      if (!data || typeof data.type !== "string") {
        setStatusKind("error");
        setStatusMsg(data?.error ?? "서버 오류가 발생했습니다.");
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }

      handleScanResponse(data, value, opts.force === true);
    } catch (e) {
      console.error(e);
      setStatusKind("error");
      setStatusMsg("네트워크 오류가 발생했습니다.");
      triggerFlash("error");
      beepError();
      vibrate([100, 50, 100]);
    } finally {
      setLoading(false);
      resetAndFocus();
    }
  };

  type ScanResponse =
    | {
        type: "invoice_start";
        invoice: InvoicePayload;
        items: ItemPayload[];
      }
    | {
        type: "invoice_change_pending";
        message: string;
        next_invoice: { id: number; invoice_no: string };
        current_invoice: {
          id: number;
          invoice_no: string;
          scanned_qty: number;
          total_qty: number;
        };
      }
    | {
        type: "scan_ok" | "scan_over_quantity_forced";
        message?: string;
        auto_reopened?: boolean;
        item: {
          invoice_item_id: number;
          item_id: number;
          name: string;
          quantity: number;
          scanned_count: number;
        };
        invoice: {
          id: number;
          status?: string;
          scanned_qty: number;
          total_qty: number;
        };
      }
    | {
        type: "scan_over_quantity_confirm";
        message: string;
        item: {
          invoice_item_id: number;
          item_id: number;
          name: string;
          quantity: number;
          scanned_count: number;
        };
      }
    | {
        type: "invoice_complete";
        auto_reopened?: boolean;
        item: {
          invoice_item_id: number;
          item_id: number;
          name: string;
          quantity: number;
          scanned_count: number;
        };
        invoice: {
          id: number;
          invoice_no: string;
          status?: string;
          scanned_qty: number;
          total_qty: number;
          completed_at: string | null;
        };
      }
    | {
        type: "scan_force_added";
        auto_reopened?: boolean;
        item: ItemPayload;
        invoice: {
          id: number;
          status?: string;
          scanned_qty: number;
          total_qty: number;
        };
      }
    | {
        type: "scan_wrong_item";
        item: { name: string };
        message: string;
      }
    | { type: "scan_unknown"; message: string }
    | { type: "scan_no_invoice"; message: string };

  // 자동 재개 처리: 응답에 auto_reopened=true 가 오면 송장 상태를 pending으로
  // 되돌리고 완료 배너를 해제한다. 모든 정상 카운트 응답에서 공통 호출.
  const applyAutoReopen = (data: { auto_reopened?: boolean }) => {
    if (!data.auto_reopened) return;
    setInvoice((prev) => (prev ? { ...prev, status: "pending" } : prev));
    setCompleteBanner(null);
  };

  const handleScanResponse = (
    data: ScanResponse,
    scannedBarcode: string,
    wasForce: boolean
  ) => {
    switch (data.type) {
      case "invoice_start": {
        setInvoice(data.invoice);
        setItems(data.items);
        setLastScannedId(null);
        setCompleteBanner(null); // 새 송장 진입 → 이전 완료 배너 해제
        setStatusKind("ok");
        setStatusMsg(`📦 송장 ${data.invoice.invoice_no} 검수 시작`);
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "invoice_change_pending": {
        setInvoiceChange({
          currentInvoice: data.current_invoice,
          nextInvoice: data.next_invoice,
          pendingBarcode: scannedBarcode,
        });
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "scan_ok": {
        updateItemCount(data.item.invoice_item_id, data.item.scanned_count);
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                scanned_qty: data.invoice.scanned_qty,
                total_qty: data.invoice.total_qty,
              }
            : prev
        );
        applyAutoReopen(data);
        setStatusKind("ok");
        // force=true였는데 정상 카운트로 빠진 경우 → 안내 메시지
        setStatusMsg(
          wasForce
            ? `✓ 이미 송장에 있던 품목입니다. 정상 카운트되었습니다. (${data.item.scanned_count}/${data.item.quantity})`
            : `✓ ${data.item.name} (${data.item.scanned_count}/${data.item.quantity})`
        );
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "scan_over_quantity_confirm": {
        // 서버는 카운트 변경 없음 — 모달로 사용자 의도 확인
        setOverQty({
          itemName: data.item.name,
          quantity: data.item.quantity,
          scannedCount: data.item.scanned_count,
          pendingBarcode: scannedBarcode,
        });
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "scan_over_quantity_forced": {
        // 사용자 [수량 추가] 후 강제 +1 — 의도된 추가
        updateItemCount(data.item.invoice_item_id, data.item.scanned_count);
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                scanned_qty: data.invoice.scanned_qty,
                total_qty: data.invoice.total_qty,
              }
            : prev
        );
        applyAutoReopen(data);
        setStatusKind("ok");
        setStatusMsg(
          data.auto_reopened
            ? `🔄 ${data.item.name} 자동 재개 + 수량 추가 (${data.item.scanned_count}/${data.item.quantity})`
            : `🟡 ${data.item.name} 수량 추가 (${data.item.scanned_count}/${data.item.quantity})`
        );
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "invoice_complete": {
        updateItemCount(data.item.invoice_item_id, data.item.scanned_count);
        // 완료 응답은 invoice 새로 완료된 상태로 set. 이전 배너는
        // 새 배너로 갱신되므로 applyAutoReopen은 호출 안 함.
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                status: "completed",
                scanned_qty: data.invoice.scanned_qty,
                total_qty: data.invoice.total_qty,
              }
            : prev
        );
        setStatusKind("ok");
        setStatusMsg(
          data.auto_reopened ? `✅ 자동 재개 후 다시 완료!` : `✅ 송장 완료!`
        );
        triggerFlash("complete");
        beepComplete();
        vibrate([200, 100, 200]);
        setCompleteBanner({ kind: "full", invoice_no: data.invoice.invoice_no });
        return;
      }
      case "scan_force_added": {
        addItem(data.item);
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                scanned_qty: data.invoice.scanned_qty,
                total_qty: data.invoice.total_qty,
              }
            : prev
        );
        applyAutoReopen(data);
        setStatusKind("ok");
        setStatusMsg(
          data.auto_reopened
            ? `🔄 ${data.item.name} 자동 재개 + 현장 추가 (1/1)`
            : `🟡 ${data.item.name} 현장 추가 (1/1)`
        );
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "scan_wrong_item": {
        setWrongItem({
          itemName: data.item.name,
          message: data.message,
          pendingBarcode: scannedBarcode,
        });
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "scan_unknown": {
        setStatusKind("error");
        setStatusMsg(`❌ ${data.message}`);
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "scan_no_invoice": {
        setStatusKind("error");
        setStatusMsg(`📦 ${data.message}`);
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      initAudio();
      sendScan(input);
    }
  };

  // ── 모달 핸들러 ──────────────────────────────────────────
  const handleInvoiceChangeConfirm = () => {
    if (!invoiceChange) return;
    const barcode = invoiceChange.pendingBarcode;
    setInvoiceChange(null);
    sendScan(barcode, { force: true });
  };

  const handleInvoiceChangeCancel = () => {
    setInvoiceChange(null);
    setStatusKind("info");
    setStatusMsg("송장 변경을 취소했습니다.");
  };

  const handleWrongItemCancel = () => {
    setWrongItem(null);
    setStatusKind("info");
    setStatusMsg("현장 추가를 취소했습니다.");
  };

  const handleWrongItemConfirm = () => {
    if (!wrongItem) return;
    const barcode = wrongItem.pendingBarcode;
    setWrongItem(null);
    sendScan(barcode, { force: true });
  };

  const handleOverQtyCancel = () => {
    setOverQty(null);
    setStatusKind("info");
    setStatusMsg("수량 추가를 취소했습니다.");
  };

  const handleOverQtyConfirm = () => {
    if (!overQty) return;
    const barcode = overQty.pendingBarcode;
    setOverQty(null);
    sendScan(barcode, { force: true });
  };

  const handleCancelInvoiceConfirm = () => {
    setCancelOpen(false);
    setInvoice(null);
    setItems([]);
    setLastScannedId(null);
    setCompleteBanner(null);
    setStatusKind("info");
    setStatusMsg("");
  };

  // [송장 변경] 버튼: 진행률 0%면 즉시 리셋, >0이면 확인 모달
  const handleCancelInvoiceClick = () => {
    if (!invoice) return;
    if (invoice.scanned_qty === 0) {
      handleCancelInvoiceConfirm();
    } else {
      setCancelOpen(true);
    }
  };

  const handlePartialCompleted = (payload: {
    completed_at: string;
    completion_reason: string;
    completion_note: string;
  }) => {
    setPartialOpen(false);
    setInvoice((prev) =>
      prev ? { ...prev, status: "completed_partial" } : prev
    );
    setStatusKind("ok");
    setStatusMsg("🟡 결품 완료 처리됨");
    triggerFlash("partial");
    beepComplete();
    vibrate([200, 100, 200]);
    if (invoice) {
      setCompleteBanner({
        kind: "partial",
        invoice_no: invoice.invoice_no,
        reason: payload.completion_reason,
        note: payload.completion_note,
      });
    }
  };

  // ── 화면 ─────────────────────────────────────────────────
  const progressPct =
    invoice && invoice.total_qty > 0
      ? Math.round((invoice.scanned_qty / invoice.total_qty) * 100)
      : 0;

  const inputBorderClass = isSessionDone
    ? completeBanner?.kind === "partial"
      ? "border-amber-500 ring-2 ring-amber-200"
      : "border-green-600 ring-2 ring-green-300"
    : flash === "ok"
      ? "border-green-500 ring-2 ring-green-300"
      : flash === "error"
        ? "border-red-500 ring-2 ring-red-300"
        : flash === "complete"
          ? "border-green-600 ring-2 ring-green-400"
          : flash === "partial"
            ? "border-amber-500 ring-2 ring-amber-200"
            : "border-zinc-300 focus-within:border-zinc-900";

  const showAuxButtons =
    invoice !== null &&
    invoice.status === "pending" &&
    invoice.scanned_qty > 0;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* 상단 */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          href="/warehouse"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← 대시보드
        </Link>
        {invoice ? (
          <div className="text-right min-w-0">
            <p className="text-[10px] text-zinc-500">현재 송장</p>
            <p className="font-mono text-xs sm:text-sm font-semibold text-zinc-900 truncate">
              {invoice.invoice_no}
            </p>
          </div>
        ) : (
          <span className="text-xs text-zinc-400">송장 대기</span>
        )}
      </div>

      {/* 완료/부분완료 배너 (자동으로 안 사라짐) */}
      {completeBanner && (
        <div
          className={`mb-4 rounded-xl p-4 shadow-sm border ${
            completeBanner.kind === "partial"
              ? "bg-amber-50 border-amber-300 text-amber-900"
              : "bg-green-50 border-green-300 text-green-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="text-3xl">
              {completeBanner.kind === "partial" ? "🟡" : "✅"}
            </div>
            <div className="flex-1">
              <p className="text-base font-bold">
                {completeBanner.kind === "partial"
                  ? "결품 완료!"
                  : "송장 완료!"}{" "}
                <span className="text-xs font-normal opacity-80 ml-1">
                  다음 송장 바코드를 스캔하세요
                </span>
              </p>
              <p className="text-[11px] font-mono opacity-80 mt-0.5 break-all">
                {completeBanner.invoice_no}
              </p>
              {completeBanner.kind === "partial" && (
                <p className="text-xs mt-1.5">
                  <span className="font-medium">
                    사유: {REASON_LABEL[completeBanner.reason] ?? completeBanner.reason}
                  </span>
                  <span className="opacity-70 ml-2">
                    · 메모: {completeBanner.note}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 단일 입력란 */}
      <div className={`bg-white border-2 rounded-xl p-4 sm:p-5 mb-4 transition-all ${inputBorderClass}`}>
        <label
          htmlFor="scan-input"
          className="block text-xs text-zinc-500 mb-2"
        >
          바코드 스캔
        </label>
        <input
          ref={inputRef}
          id="scan-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={input ?? ""}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => initAudio()}
          disabled={loading || modalOpen}
          placeholder={
            isSessionDone
              ? "다음 송장 바코드를 스캔하세요"
              : invoice
                ? "품목 바코드 또는 다른 송장 바코드"
                : "송장 바코드를 스캔하세요"
          }
          className="w-full text-lg sm:text-xl font-mono px-4 py-4 border border-zinc-200 rounded-lg focus:outline-none disabled:opacity-50"
        />
        {statusMsg && (
          <p
            className={`mt-3 text-sm font-medium ${
              statusKind === "ok"
                ? "text-green-700"
                : statusKind === "error"
                  ? "text-red-700"
                  : "text-zinc-600"
            }`}
          >
            {statusMsg}
          </p>
        )}
      </div>

      {/* 송장 정보 + 진행률 */}
      {invoice && (
        <article className="border border-zinc-200 rounded-xl p-4 bg-white mb-4">
          <div className="flex items-center gap-2 mb-3">
            {customerTypeBadge(invoice.customer_type)}
            {invoice.status === "completed" ? (
              <Badge tone="green">완료</Badge>
            ) : invoice.status === "completed_partial" ? (
              <Badge tone="amber">부분 완료</Badge>
            ) : (
              <Badge tone="amber">검수 중</Badge>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-4">
            <div>
              <dt className="text-[11px] text-zinc-500">주문번호</dt>
              <dd className="font-mono text-xs text-zinc-800">
                {invoice.order_no ?? <span className="text-zinc-300">-</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">송하인</dt>
              <dd className="text-xs text-zinc-800">
                {invoice.sender_name ?? <span className="text-zinc-300">-</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">수령인</dt>
              <dd className="text-xs text-zinc-800">
                {invoice.recipient_name_masked}
                <span className="text-zinc-400 ml-1 font-mono">
                  · {invoice.recipient_phone_masked}
                </span>
              </dd>
            </div>
          </dl>

          {/* 진행률 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-500">진행률</span>
              <span className="text-xs text-zinc-700">
                <span className="font-semibold text-zinc-900">
                  {invoice.scanned_qty}
                </span>
                <span className="text-zinc-400"> / </span>
                <span>{invoice.total_qty}</span>
                <span className="text-zinc-400 ml-1">({progressPct}%)</span>
              </span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  invoice.status === "completed_partial"
                    ? "bg-amber-500"
                    : progressPct === 100
                      ? "bg-green-500"
                      : progressPct > 0
                        ? "bg-zinc-700"
                        : "bg-zinc-300"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </article>
      )}

      {/* 품목 카드 */}
      {invoice && (
        <section className="mb-4">
          <h2 className="text-sm font-semibold text-zinc-900 mb-2">
            품목{" "}
            <span className="text-zinc-400 font-normal">
              ({items.length}건)
            </span>
          </h2>
          {items.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
              연결된 품목이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((it) => {
                const showOriginal =
                  !!it.display_name && it.display_name !== it.name;
                const complete =
                  it.scanned_count >= it.quantity && it.quantity > 0;
                const over =
                  it.scanned_count > it.quantity && it.quantity > 0;
                const highlighted = lastScannedId === it.invoice_item_id;
                const isAdded = it.is_added_on_scan === true;
                return (
                  <div
                    key={it.invoice_item_id}
                    className={`border rounded-lg overflow-hidden bg-white flex flex-col transition-all ${
                      over
                        ? "border-red-400 ring-2 ring-red-200"
                        : isAdded
                          ? "border-amber-400"
                          : complete
                            ? "border-green-300"
                            : "border-zinc-200"
                    } ${highlighted ? "shadow-md scale-[1.02]" : ""}`}
                  >
                    <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
                      {it.has_image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/api/warehouse/items/${it.item_id}/image?v=${new Date(it.updated_at).getTime()}`}
                          alt={it.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-zinc-300">
                          이미지 없음
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col">
                      <h3 className="font-medium text-sm text-zinc-900 line-clamp-2 mb-1">
                        {it.name}
                      </h3>
                      {showOriginal && (
                        <p className="text-[10px] text-zinc-400 line-clamp-1 mb-1.5">
                          ★{it.display_name}
                        </p>
                      )}
                      <div className="text-xs text-zinc-700 mb-2 flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">×{it.quantity}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] border ${
                            over
                              ? "bg-red-50 text-red-700 border-red-200"
                              : complete
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-zinc-50 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          {it.scanned_count}/{it.quantity}
                        </span>
                        {isAdded && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200">
                            🟡 현장 추가
                          </span>
                        )}
                      </div>
                      <div className="mt-auto">
                        {it.barcode ? (
                          <p className="font-mono text-[10px] text-zinc-500 truncate">
                            {it.barcode}
                          </p>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px]">
                            바코드 미등록
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 보조 영역 - 진행률 > 0이고 pending일 때만 */}
      {showAuxButtons && (
        <section className="mt-6 border-t border-zinc-200 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              onClick={() => setPartialOpen(true)}
              className="text-sm text-amber-700 hover:text-amber-900 hover:underline transition self-start"
            >
              부분 완료가 필요한가요? <span className="font-medium">결품으로 완료</span>
            </button>
            <button
              type="button"
              onClick={handleCancelInvoiceClick}
              className="text-sm px-3 py-1.5 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition self-start sm:self-auto"
            >
              송장 변경
            </button>
          </div>
        </section>
      )}

      {/* 모달 */}
      {wrongItem && (
        <WrongItemModal
          itemName={wrongItem.itemName}
          message={wrongItem.message}
          onCancel={handleWrongItemCancel}
          onConfirm={handleWrongItemConfirm}
        />
      )}
      {overQty && (
        <OverQuantityModal
          itemName={overQty.itemName}
          quantity={overQty.quantity}
          scannedCount={overQty.scannedCount}
          onCancel={handleOverQtyCancel}
          onConfirm={handleOverQtyConfirm}
        />
      )}
      {invoiceChange && (
        <InvoiceChangeModal
          currentInvoice={invoiceChange.currentInvoice}
          nextInvoice={invoiceChange.nextInvoice}
          onCancel={handleInvoiceChangeCancel}
          onConfirm={handleInvoiceChangeConfirm}
        />
      )}
      {partialOpen && invoice && (
        <PartialCompleteModal
          invoiceId={invoice.id}
          items={items.map((it) => ({
            invoice_item_id: it.invoice_item_id,
            name: it.name,
            quantity: it.quantity,
            scanned_count: it.scanned_count,
          }))}
          scannedQty={invoice.scanned_qty}
          totalQty={invoice.total_qty}
          onCancel={() => setPartialOpen(false)}
          onCompleted={handlePartialCompleted}
        />
      )}
      {cancelOpen && invoice && (
        <CancelInvoiceModal
          invoiceNo={invoice.invoice_no}
          scannedQty={invoice.scanned_qty}
          totalQty={invoice.total_qty}
          onCancel={() => setCancelOpen(false)}
          onConfirm={handleCancelInvoiceConfirm}
        />
      )}
    </main>
  );
}
