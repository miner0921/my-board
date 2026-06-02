"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import WrongItemModal from "./WrongItemModal";
import InvoiceChangeModal from "./InvoiceChangeModal";
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
};

type FlashKind = "ok" | "error" | "complete" | null;

type WrongItemState = { itemName: string; message: string } | null;
type InvoiceChangeState = {
  currentInvoice: { id: number; invoice_no: string; scanned_qty: number; total_qty: number };
  nextInvoice: { id: number; invoice_no: string };
  pendingBarcode: string;
} | null;

function customerTypeBadge(type: string | null) {
  if (type === "business")
    return <Badge tone="blue">사업자</Badge>;
  if (type === "individual")
    return <Badge tone="green">개인</Badge>;
  if (type === "retail")
    return <Badge tone="purple">소매</Badge>;
  return null;
}

function Badge({
  tone,
  children,
}: {
  tone: "blue" | "green" | "purple" | "amber" | "zinc";
  children: React.ReactNode;
}) {
  const cls = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    zinc: "bg-zinc-50 text-zinc-600 border-zinc-200",
  }[tone];
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${cls}`}>
      {children}
    </span>
  );
}

export default function ScanPage() {
  const [invoice, setInvoice] = useState<InvoicePayload | null>(null);
  const [items, setItems] = useState<ItemPayload[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // 상태 표시: 마지막 스캔 결과 (성공/실패 메시지)
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"ok" | "error" | "info">("info");

  // 화면 깜빡임 효과
  const [flash, setFlash] = useState<FlashKind>(null);

  // 마지막 스캔된 invoice_item_id (카드 강조용)
  const [lastScannedId, setLastScannedId] = useState<number | null>(null);

  // 모달 상태
  const [wrongItem, setWrongItem] = useState<WrongItemState>(null);
  const [invoiceChange, setInvoiceChange] = useState<InvoiceChangeState>(null);

  // 완료 알림
  const [completeBanner, setCompleteBanner] =
    useState<{ invoice_no: string } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modalOpen = wrongItem !== null || invoiceChange !== null;

  // 입력란 비우고 다음 프레임에 focus 복원
  const resetAndFocus = useCallback(() => {
    setInput("");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  // 초기 + 송장 변경 시 자동 focus
  useEffect(() => {
    if (!modalOpen) inputRef.current?.focus();
  }, [invoice, modalOpen]);

  // 모달 닫힌 직후 input focus 복원
  useEffect(() => {
    if (!modalOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [modalOpen]);

  // 깜빡임 자동 해제
  const triggerFlash = (kind: FlashKind) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(kind);
    flashTimerRef.current = setTimeout(() => setFlash(null), 350);
  };

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  // 품목 카드 갱신 (scanned_count, lastScanned 강조)
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

  // ── 핵심: 바코드 스캔 처리 ───────────────────────────────
  const sendScan = async (
    barcode: string,
    opts: { force?: boolean } = {}
  ) => {
    const value = barcode.trim();
    if (!value) return;

    setLoading(true);
    try {
      const res = await fetch("/api/warehouse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: value,
          current_invoice_id: invoice?.id ?? null,
          force: opts.force === true,
        }),
      });
      const data = await res.json();

      // 인증/서버 에러 등 type 없는 응답
      if (!data || typeof data.type !== "string") {
        setStatusKind("error");
        setStatusMsg(data?.error ?? "서버 오류가 발생했습니다.");
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }

      handleScanResponse(data, value);
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
        type: "scan_ok" | "scan_over_quantity";
        message?: string;
        item: {
          invoice_item_id: number;
          item_id: number;
          name: string;
          quantity: number;
          scanned_count: number;
        };
        invoice: {
          id: number;
          scanned_qty: number;
          total_qty: number;
        };
      }
    | {
        type: "invoice_complete";
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
          scanned_qty: number;
          total_qty: number;
          completed_at: string | null;
        };
      }
    | {
        type: "scan_wrong_item";
        item: { name: string };
        message: string;
      }
    | { type: "scan_unknown"; message: string }
    | { type: "scan_no_invoice"; message: string };

  const handleScanResponse = (data: ScanResponse, scannedBarcode: string) => {
    switch (data.type) {
      case "invoice_start": {
        setInvoice(data.invoice);
        setItems(data.items);
        setLastScannedId(null);
        setStatusKind("ok");
        setStatusMsg(`📦 송장 ${data.invoice.invoice_no} 검수 시작`);
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "invoice_change_pending": {
        // 모달로 사용자 확인
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
        setStatusKind("ok");
        setStatusMsg(
          `✓ ${data.item.name} (${data.item.scanned_count}/${data.item.quantity})`
        );
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "scan_over_quantity": {
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
        setStatusKind("error");
        setStatusMsg(
          `⚠️ ${data.item.name} 수량 초과 (${data.item.scanned_count}/${data.item.quantity})`
        );
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "invoice_complete": {
        updateItemCount(data.item.invoice_item_id, data.item.scanned_count);
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
        setStatusMsg(`✅ 송장 완료!`);
        triggerFlash("complete");
        beepComplete();
        vibrate([200, 100, 200]);

        // 2초 후 송장 대기 상태로 자동 전환
        setCompleteBanner({ invoice_no: data.invoice.invoice_no });
        if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
        completeTimerRef.current = setTimeout(() => {
          setInvoice(null);
          setItems([]);
          setLastScannedId(null);
          setCompleteBanner(null);
          setStatusMsg("");
          setStatusKind("info");
          requestAnimationFrame(() => inputRef.current?.focus());
        }, 2000);
        return;
      }
      case "scan_wrong_item": {
        setWrongItem({ itemName: data.item.name, message: data.message });
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
      initAudio(); // 사용자 제스처에서 오디오 활성화 (idempotent)
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

  const handleWrongItemClose = () => {
    setWrongItem(null);
  };

  // ── 화면 ─────────────────────────────────────────────────
  const progressPct =
    invoice && invoice.total_qty > 0
      ? Math.round((invoice.scanned_qty / invoice.total_qty) * 100)
      : 0;

  const inputBorderClass =
    flash === "ok"
      ? "border-green-500 ring-2 ring-green-300"
      : flash === "error"
        ? "border-red-500 ring-2 ring-red-300"
        : flash === "complete"
          ? "border-green-600 ring-2 ring-green-400"
          : "border-zinc-300 focus-within:border-zinc-900";

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* 상단: 대시보드 링크 + 송장 표시 */}
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
            invoice
              ? "품목 바코드 또는 다른 송장 바코드"
              : "송장 바코드를 스캔하세요"
          }
          className="w-full text-lg sm:text-xl font-mono px-4 py-4 border border-zinc-200 rounded-lg focus:outline-none disabled:opacity-50"
        />
        {/* 상태 메시지 */}
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

      {/* 송장 정보 + 진행률 (송장 진입 시) */}
      {invoice && (
        <article className="border border-zinc-200 rounded-xl p-4 bg-white mb-4">
          <div className="flex items-center gap-2 mb-3">
            {customerTypeBadge(invoice.customer_type)}
            {invoice.status === "completed" ? (
              <Badge tone="green">완료</Badge>
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
                  progressPct === 100
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
        <section>
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
                return (
                  <div
                    key={it.invoice_item_id}
                    className={`border rounded-lg overflow-hidden bg-white flex flex-col transition-all ${
                      over
                        ? "border-red-400 ring-2 ring-red-200"
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

      {/* 완료 배너 (2초간) */}
      {completeBanner && (
        <div className="fixed inset-x-0 top-20 z-40 flex items-center justify-center pointer-events-none px-4">
          <div className="bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl text-center max-w-sm w-full">
            <div className="text-3xl mb-1">✅</div>
            <p className="text-lg font-bold">송장 완료!</p>
            <p className="text-xs opacity-90 font-mono mt-0.5 break-all">
              {completeBanner.invoice_no}
            </p>
          </div>
        </div>
      )}

      {/* 모달 */}
      {wrongItem && (
        <WrongItemModal
          itemName={wrongItem.itemName}
          message={wrongItem.message}
          onClose={handleWrongItemClose}
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
    </main>
  );
}
