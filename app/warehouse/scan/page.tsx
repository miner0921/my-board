"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WrongItemModal from "./WrongItemModal";
import InvoiceChangeModal from "./InvoiceChangeModal";
import PartialCompleteModal from "./PartialCompleteModal";
import CancelInvoiceModal from "./CancelInvoiceModal";
import OverQuantityModal from "./OverQuantityModal";
import OrderText from "./OrderText";
import InvoiceNotice from "./InvoiceNotice";
import AddItemModal, { type AddResult } from "./AddItemModal";
import ScanItemCard from "./ScanItemCard";
import QuantityModal from "./QuantityModal";
import ExcludeItemModal from "./ExcludeItemModal";
import ScanItemMenuModal from "./ScanItemMenuModal";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  beepBlocked,
  beepComplete,
  beepError,
  beepSuccess,
  initAudio,
  vibrate,
} from "@/lib/feedback";
import { isCompletedStatus } from "@/lib/invoice-status";

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
  customer_type: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  total_qty: number;
  scanned_qty: number;
  admin_memo: string | null;
  reopen_reason: string | null;
};

type ItemPayload = {
  invoice_item_id: number;
  item_id: number;
  quantity: number;
  scanned_count: number;
  display_name: string | null;
  name: string;
  barcode: string | null;
  // 대표(barcode) 또는 추가 바코드(item_barcodes)가 하나라도 있으면 true.
  //   스캔 가능 여부 = 수동 챙김 대상 여부 판정에 쓴다(대표 없어도 추가만 있으면 스캔 가능).
  has_barcode?: boolean;
  has_image: boolean;
  updated_at: string;
  is_added_on_scan?: boolean;
  scan_exempt?: boolean;
  // 스캔불필요(검수 제외) — 카드/진행률/완료에서 빠지되 화면엔 흐리게 표시(사라지지 않음).
  inspection_exempt?: boolean;
  // 취소(excluded)된 품목 — items 에 남겨두되 카드/진행률에선 제외, OrderText 에선 "(취소)".
  excluded?: boolean;
}

// 품목이 스캔 가능한(=수동 챙김 대상이 아닌) 바코드를 갖고 있는지.
//   서버 payload 의 has_barcode 를 우선 쓰고, 없으면 대표 바코드 유무로 폴백.
function hasAnyBarcode(it: { has_barcode?: boolean; barcode: string | null }): boolean {
  return it.has_barcode ?? it.barcode !== null;
};

// "전체 상품"(OrderText)용 송장 원문 라인. 별칭으로 합쳐지기 전 원문 그대로.
// item_id 로 live items 의 완료/제외 상태를 끌어온다.
type RawLine = {
  rawName: string;
  qty: number;
  item_id: number | null;
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
  const [rawLines, setRawLines] = useState<RawLine[]>([]);
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

  // 수동 챙김(수량 입력) 대상 품목
  const [manualTarget, setManualTarget] = useState<ItemPayload | null>(null);
  // 품목 검색 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  // 제외(빼기) 대상 품목
  const [excludeTarget, setExcludeTarget] = useState<ItemPayload | null>(null);
  // 완료 카드 클릭 시 뜨는 메뉴(수량 수정 / 취소) 대상 품목
  const [menuTarget, setMenuTarget] = useState<ItemPayload | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modalOpen =
    wrongItem !== null ||
    overQty !== null ||
    invoiceChange !== null ||
    partialOpen ||
    cancelOpen ||
    manualTarget !== null ||
    excludeTarget !== null ||
    menuTarget !== null ||
    addModalOpen;

  // 송장이 완료/부분완료 상태면 "세션 끝" — 품목 스캔은 서버에서 자연스럽게
  // scan_no_invoice로 처리되도록 current_invoice_id=null로 보냄.
  const isSessionDone =
    invoice !== null && isCompletedStatus(invoice.status);

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

  // 카운트 갱신 + 신규 행 보강(upsert). 완료 송장에 현장 추가 시
  // 즉시 재완료되어 invoice_complete로 응답될 때, 배열에 없는 신규
  // 품목 카드도 함께 추가하기 위함. (없으면 추가 / 있으면 카운트만 갱신)
  const upsertItem = (item: { invoice_item_id: number; scanned_count: number } & Partial<ItemPayload>) => {
    setItems((prev) => {
      const exists = prev.some((it) => it.invoice_item_id === item.invoice_item_id);
      if (exists) {
        // 추가/스캔(force·검색)은 DB 레벨에서 un-exclude(복구)하므로
        //   취소돼 있던 행이면 excluded 를 풀어 "(취소)" 표시를 지운다(흔적 없음).
        return prev.map((it) =>
          it.invoice_item_id === item.invoice_item_id
            ? { ...it, scanned_count: item.scanned_count, excluded: false }
            : it
        );
      }
      // 신규 행: 카드 렌더링에 필요한 필드 기본값 보강 후 추가
      return [
        ...prev,
        {
          display_name: null,
          barcode: null,
          has_barcode: false,
          has_image: false,
          updated_at: new Date().toISOString(),
          is_added_on_scan: true,
          scan_exempt: false,
          ...item,
        } as ItemPayload,
      ];
    });
    setLastScannedId(item.invoice_item_id);
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

      // handleScanResponse는 뒤에서 선언되지만 매 렌더 재생성되어 stale 캡처 없음.
      //   (자동 스캔 effect 도입으로 규칙이 이 forward-ref를 감지 → 안전하므로 무시)
      // eslint-disable-next-line react-hooks/immutability
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

  // URL ?code= 로 진입 시(송장 상세 "출고 검수로 이동") 해당 송장을 자동으로 연다.
  //   물리 바코드 스캔과 동일하게 sendScan → invoice_start 경로를 그대로 재사용한다.
  //   StrictMode 이중 실행 방지용 1회성 가드 + 실행 직후 ?code 제거(새로고침 재실행 방지).
  const autoScannedRef = useRef(false);
  useEffect(() => {
    if (autoScannedRef.current) return;
    autoScannedRef.current = true;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    // ?code 는 즉시 제거(새로고침 재실행 방지). 스캔은 매크로태스크로 미뤄
    //   effect 본문에서 동기 setState가 일어나지 않게 한다.
    window.history.replaceState(null, "", window.location.pathname);
    setTimeout(() => sendScan(code), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  type ScanResponse =
    | {
        type: "invoice_start";
        invoice: InvoicePayload;
        items: ItemPayload[];
        rawLines: RawLine[];
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
        // 완료 응답의 item: 기존 품목 완료 시엔 기본 5개 필드,
        // 현장 추가로 재완료될 땐 신규 카드용 ItemPayload 전 필드가 옴.
        item: {
          invoice_item_id: number;
          item_id: number;
          name: string;
          quantity: number;
          scanned_count: number;
        } & Partial<ItemPayload>;
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
    | { type: "scan_no_invoice"; message: string }
    | {
        type: "scan_inspection_exempt";
        item: { name: string };
        message: string;
      };

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
        setRawLines(data.rawLines ?? []);
        setLastScannedId(null);
        setCompleteBanner(null); // 새 송장 진입 → 이전 완료 배너 해제
        setStatusKind("ok");
        setStatusMsg(`송장 ${data.invoice.invoice_no} 검수 시작`);
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
            ? `이미 송장에 있던 품목입니다. 정상 카운트되었습니다. (${data.item.scanned_count}/${data.item.quantity})`
            : `${data.item.name} (${data.item.scanned_count}/${data.item.quantity})`
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
            ? `${data.item.name} 자동 재개 + 수량 추가 (${data.item.scanned_count}/${data.item.quantity})`
            : `${data.item.name} 수량 추가 (${data.item.scanned_count}/${data.item.quantity})`
        );
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
        return;
      }
      case "invoice_complete": {
        // upsert: 기존 품목이면 카운트 갱신, 현장 추가로 재완료된 신규
        // 품목이면 카드를 배열에 추가 (배열에 없으면 안 보이던 버그 수정)
        upsertItem(data.item);
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
          data.auto_reopened ? `자동 재개 후 다시 완료!` : `송장 완료!`
        );
        triggerFlash("complete");
        beepComplete();
        vibrate([200, 100, 200]);
        setCompleteBanner({ kind: "full", invoice_no: data.invoice.invoice_no });
        return;
      }
      case "scan_force_added": {
        // upsert 로 처리 — 신규는 추가, 취소돼 있던 행을 바코드로 복구한 경우엔
        //   기존 행 갱신 + excluded 해제(중복 행 방지). DB도 ON CONFLICT 로 un-exclude.
        upsertItem(data.item);
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
            ? `${data.item.name} 자동 재개 + 현장 추가 (1/1)`
            : `${data.item.name} 현장 추가 (1/1)`
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
        setStatusMsg(`${data.message}`);
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "scan_no_invoice": {
        setStatusKind("error");
        setStatusMsg(`${data.message}`);
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      case "scan_inspection_exempt": {
        // 스캔불필요 품목 — 오류 아님. 카운트 없이 안내만(빨간 오류 연출 배제).
        setStatusKind("info");
        setStatusMsg(`${data.item.name}: ${data.message}`);
        vibrate([60]);
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

  // 위험 모달이 떠 있는 동안 스캔(Enter)이 들어오면 호출 — 무시만 하지 않고 경고.
  //   경고음(정상 스캔과 다른 beepBlocked) + 진동 + 모달 안 배너(가드 훅이 처리).
  //   작업자가 물건만 보고 화면을 안 봐도 소리로 즉시 알아채 멈추게 한다.
  const handleBlockedScan = useCallback(() => {
    initAudio();
    beepBlocked();
    vibrate([60, 40, 60, 40, 60]);
    setStatusKind("error");
    setStatusMsg("⚠️ 처리 대기 중인 경고가 있습니다. 화면을 확인하세요.");
  }, []);

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
    setRawLines([]);
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
    setStatusMsg("결품 완료 처리됨");
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

  // 검수 화면 품목을 두 구역으로 나눈다. 순서는 송장 원문 순서(ii.id) 그대로.
  //   - remainingItems: 아직 안 끝난 품목 ("남은 상품")
  //   - completedItems: 다 찍은/챙긴 품목 ("완료된 상품" — 초록, 사라지지 않음)
  // items 엔 취소(excluded) 품목도 들어있다(OrderText "(취소)" 표시용) → 카드/진행률에선 제외.
  const isItemComplete = (it: ItemPayload) =>
    it.scanned_count >= it.quantity && it.quantity > 0;
  // 스캔불필요(검수 제외) 품목은 남은/완료 카드·진행 계산에서 빠지고, 별도 영역에
  //   흐리게만 표시한다(송장에 있다는 사실은 작업자가 알 수 있게).
  const activeItems = items.filter(
    (it) => !it.excluded && !it.inspection_exempt
  );
  const exemptItems = items.filter(
    (it) => !it.excluded && it.inspection_exempt
  );
  const remainingItems = activeItems.filter((it) => !isItemComplete(it));
  const completedItems = activeItems.filter(isItemComplete);

  // 품목 취소(송장에서 빼기) 확정 — 내부 API/식별자는 exclude 그대로 사용
  const handleExclude = async (reason: string) => {
    const target = excludeTarget;
    if (!invoice || !target) return;
    setExcludeTarget(null);
    setLoading(true);
    try {
      const res = await fetch("/api/warehouse/scan/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          invoice_item_id: target.invoice_item_id,
          action: "exclude",
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusKind("error");
        setStatusMsg(data?.error ?? "품목 취소에 실패했습니다.");
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      // 취소된 행은 카드/진행률에선 빠지되, items 엔 excluded 플래그로 남겨둔다
      //   (OrderText "전체 상품"에서 "(취소)"로 보여주기 위함).
      setItems((prev) =>
        prev.map((it) =>
          it.invoice_item_id === target.invoice_item_id
            ? { ...it, excluded: true }
            : it
        )
      );
      if (lastScannedId === target.invoice_item_id) setLastScannedId(null);

      if (data.type === "invoice_complete") {
        // 취소 결과 남은 품목이 전부 채워져 자동 완료된 경우
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
        setStatusMsg(`${target.name} 취소 → 송장 완료!`);
        triggerFlash("complete");
        beepComplete();
        vibrate([200, 100, 200]);
        setCompleteBanner({ kind: "full", invoice_no: data.invoice.invoice_no });
      } else {
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
        setStatusMsg(`${target.name} 취소됨 (송장에서 빠짐)`);
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
      }
    } catch (e) {
      console.error(e);
      setStatusKind("error");
      setStatusMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      resetAndFocus();
    }
  };

  // 품목 검색 추가 결과 처리 — 카드 upsert + 송장 합계 갱신.
  // 바코드 없는 품목을 새로 추가/복구하면 곧바로 수량(수동 챙김) 모달을 연다.
  const handleItemAdded = (result: AddResult) => {
    const it = result.item;
    const card: ItemPayload = {
      invoice_item_id: it.invoice_item_id,
      item_id: it.item_id,
      quantity: it.quantity,
      scanned_count: it.scanned_count,
      display_name: it.display_name,
      name: it.name,
      barcode: it.barcode,
      has_barcode: it.has_barcode,
      has_image: it.has_image,
      updated_at: it.updated_at,
      is_added_on_scan: it.is_added_on_scan,
      scan_exempt: it.scan_exempt,
      inspection_exempt: it.inspection_exempt,
    };
    upsertItem(card);
    setInvoice((prev) =>
      prev
        ? {
            ...prev,
            status: result.invoice.status,
            scanned_qty: result.invoice.scanned_qty,
            total_qty: result.invoice.total_qty,
          }
        : prev
    );
    if (result.outcome !== "already_present") setCompleteBanner(null);

    const label =
      result.outcome === "already_present"
        ? "이미 송장에 있음"
        : result.outcome === "restored"
          ? "품목 복구"
          : "현장 추가";
    setStatusKind("ok");
    setStatusMsg(`${it.name} ${label}`);

    // 바코드가 하나도 없는 품목을 새로 넣었으면 수량 입력(수동 챙김)으로 바로 연결.
    //   대표는 없어도 추가 바코드가 있으면 스캔 가능 → 자동으로 수동 모달 열지 않음.
    //   스캔불필요 품목은 검수 대상이 아니므로 수동 모달을 열지 않는다.
    if (
      !card.inspection_exempt &&
      !hasAnyBarcode(card) &&
      result.outcome !== "already_present"
    ) {
      setManualTarget(card);
    }
  };

  // 수동 챙김 확정 (바코드 없는 품목 + 동봉)
  const handleManualPick = async (count: number) => {
    const target = manualTarget;
    if (!invoice || !target) return;
    setManualTarget(null);
    setLoading(true);
    try {
      const res = await fetch("/api/warehouse/scan/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          invoice_item_id: target.invoice_item_id,
          count,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusKind("error");
        setStatusMsg(data?.error ?? "수동 챙김에 실패했습니다.");
        triggerFlash("error");
        beepError();
        vibrate([100, 50, 100]);
        return;
      }
      updateItemCount(data.item.invoice_item_id, data.item.scanned_count);
      setLastScannedId(data.item.invoice_item_id);
      if (data.type === "invoice_complete") {
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
          data.auto_reopened ? "자동 재개 후 다시 완료!" : "송장 완료!"
        );
        triggerFlash("complete");
        beepComplete();
        vibrate([200, 100, 200]);
        setCompleteBanner({ kind: "full", invoice_no: data.invoice.invoice_no });
      } else {
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
          `${data.item.name} 챙김 (${data.item.scanned_count}/${data.item.quantity})`
        );
        triggerFlash("ok");
        beepSuccess();
        vibrate(50);
      }
    } catch (e) {
      console.error(e);
      setStatusKind("error");
      setStatusMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      resetAndFocus();
    }
  };

  return (
    <div className="max-w-5xl">
      {/* 1) Sticky 상단 박스 — 입력 + 송장/수취인 정보 + 진행률 띠를 한 박스로 */}
      <div className="sticky top-0 z-20 bg-white pt-1 pb-3">
        <div
          className={`bg-white border-2 rounded-xl overflow-hidden shadow-sm transition-all ${inputBorderClass}`}
        >
          {/* 바코드 입력 */}
          <div className="p-3 sm:p-4">
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
                className={`mt-2 text-lg sm:text-xl font-semibold flex items-center gap-1.5 ${
                  statusKind === "ok"
                    ? "text-green-700"
                    : statusKind === "error"
                      ? "text-red-700"
                      : "text-zinc-600"
                }`}
              >
                {statusKind === "ok" && (
                  <CheckCircle2 size={22} strokeWidth={2} className="shrink-0" />
                )}
                {statusKind === "error" && (
                  <AlertCircle size={22} strokeWidth={2} className="shrink-0" />
                )}
                {statusMsg}
              </p>
            )}
          </div>

          {/* 송장/수취인 정보 (송장 진입 후) */}
          {invoice && (
            <div className="px-3 sm:px-4 pb-2 border-t border-zinc-100 pt-2 space-y-1.5">
              {/* 줄1: 송장번호 · 주문번호 · 우측 상태/진행 배지 */}
              <div className="flex items-center gap-4 min-w-0">
                <span className="truncate">
                  <span className="text-xs text-zinc-400 mr-1.5">송장번호</span>
                  <span className="text-sm text-zinc-800">
                    {invoice.invoice_no}
                  </span>
                </span>
                {invoice.order_no && (
                  <span className="truncate shrink-0">
                    <span className="text-xs text-zinc-400 mr-1.5">주문번호</span>
                    <span className="text-sm text-zinc-800">
                      {invoice.order_no}
                    </span>
                  </span>
                )}
                <span className="ml-auto shrink-0">
                  {invoice.status === "completed" ? (
                    <Badge tone="green">
                      완료 · {invoice.scanned_qty}/{invoice.total_qty}
                    </Badge>
                  ) : invoice.status === "completed_partial" ? (
                    <Badge tone="amber">
                      부분 완료 · {invoice.scanned_qty}/{invoice.total_qty}
                    </Badge>
                  ) : invoice.status === "manual_completed" ? (
                    <Badge tone="purple">
                      수동완료 · {invoice.scanned_qty}/{invoice.total_qty}
                    </Badge>
                  ) : (
                    <Badge tone="amber">
                      검수 중 · {invoice.scanned_qty}/{invoice.total_qty}
                    </Badge>
                  )}
                </span>
              </div>
              {/* 줄2: 수취인 이름 · 전화 · 주소(가로 나란히, 주소 말줄임) */}
              {(invoice.recipient_name ||
                invoice.recipient_phone ||
                invoice.recipient_address) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {invoice.recipient_name && (
                    <span className="shrink-0">
                      <span className="text-xs text-zinc-400 mr-1.5">수취인</span>
                      <span className="text-sm text-zinc-800">
                        {invoice.recipient_name}
                      </span>
                    </span>
                  )}
                  {invoice.recipient_phone && (
                    <span className="shrink-0">
                      <span className="text-xs text-zinc-400 mr-1.5">연락처</span>
                      <span className="text-sm text-zinc-800">
                        {invoice.recipient_phone}
                      </span>
                    </span>
                  )}
                  {invoice.recipient_address && (
                    <span>
                      <span className="text-xs text-zinc-400 mr-1.5">주소</span>
                      <span className="text-sm text-zinc-800">
                        {invoice.recipient_address}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 진행률 — 박스 맨 아래 가장자리 4px 띠 */}
          {invoice && (
            <div className="h-1 bg-zinc-100">
              <div
                className={`h-full transition-all ${
                  invoice.status === "completed_partial"
                    ? "bg-amber-500"
                    : progressPct > 0
                      ? "bg-green-500"
                      : "bg-zinc-300"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        {/* 송장 안내(관리자→작업자) — 재개 사유 + 메모. 있을 때만. */}
        {invoice && (
          <div className="mt-2">
            <InvoiceNotice
              reopenReason={invoice.reopen_reason}
              adminMemo={invoice.admin_memo}
            />
          </div>
        )}

        {/* 전체 상품 — 상단 박스와 함께 sticky 고정. 길면 내부 스크롤. */}
        {invoice && (
          <div className="mt-2">
            <OrderText items={items} rawLines={rawLines} />
          </div>
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
            <div className="shrink-0 mt-0.5">
              {completeBanner.kind === "partial" ? (
                <AlertCircle size={28} strokeWidth={1.75} className="text-amber-600" />
              ) : (
                <CheckCircle2 size={28} strokeWidth={1.75} className="text-green-600" />
              )}
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

      {/* 제품 카드 — "남은 상품"(위) / "완료된 상품"(아래) 두 구역 */}
      {invoice && activeItems.length === 0 && (
        <div className="text-center py-8 border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
          <p>연결된 품목이 없습니다.</p>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            disabled={modalOpen}
            className="mt-3 text-xs px-3 py-1.5 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-40"
          >
            + 품목 추가
          </button>
        </div>
      )}

      {/* 남은 상품 */}
      {invoice && activeItems.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-zinc-500">남은 상품</p>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              disabled={modalOpen}
              className="text-xs px-2.5 py-1 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-40"
            >
              + 품목 추가
            </button>
          </div>
          {remainingItems.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-green-300 bg-green-50 rounded-lg text-green-700 text-sm">
              남은 상품이 없습니다 — 모든 품목을 확인했습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {remainingItems.map((it) => (
                <ScanItemCard
                  key={it.invoice_item_id}
                  item={{
                    itemId: it.item_id,
                    name: it.name,
                    quantity: it.quantity,
                    scannedCount: it.scanned_count,
                    barcode: it.barcode,
                    hasBarcode: hasAnyBarcode(it),
                    hasImage: it.has_image,
                    updatedAt: it.updated_at,
                    isAddedOnScan: it.is_added_on_scan === true,
                    scanExempt: it.scan_exempt === true,
                  }}
                  highlighted={lastScannedId === it.invoice_item_id}
                  onPick={() => setManualTarget(it)}
                  onExclude={() => setExcludeTarget(it)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 완료된 상품 — 카드 클릭 시 메뉴(수량 수정 / 취소) */}
      {invoice && completedItems.length > 0 && (
        <>
          <p className="text-[11px] text-zinc-500 mt-5 mb-1.5">완료된 상품</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {completedItems.map((it) => (
              <ScanItemCard
                key={it.invoice_item_id}
                item={{
                  itemId: it.item_id,
                  name: it.name,
                  quantity: it.quantity,
                  scannedCount: it.scanned_count,
                  barcode: it.barcode,
                  hasBarcode: hasAnyBarcode(it),
                  hasImage: it.has_image,
                  updatedAt: it.updated_at,
                  isAddedOnScan: it.is_added_on_scan === true,
                  scanExempt: it.scan_exempt === true,
                }}
                highlighted={lastScannedId === it.invoice_item_id}
                onMenu={() => setMenuTarget(it)}
              />
            ))}
          </div>
        </>
      )}

      {/* 스캔불필요(검수 제외) 상품 — 검수 대상 아님. 클릭/스캔 비활성, 흐리게 표시만.
          송장에 있다는 사실은 작업자가 알 수 있게 목록 하단에 남긴다. */}
      {invoice && exemptItems.length > 0 && (
        <>
          <p className="text-[11px] text-zinc-500 mt-5 mb-1.5">
            스캔불필요 상품{" "}
            <span className="text-zinc-400">(검수 대상 아님 · 표기용)</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 opacity-60">
            {exemptItems.map((it) => (
              <ScanItemCard
                key={it.invoice_item_id}
                item={{
                  itemId: it.item_id,
                  name: it.name,
                  quantity: it.quantity,
                  scannedCount: it.scanned_count,
                  barcode: it.barcode,
                  hasBarcode: hasAnyBarcode(it),
                  hasImage: it.has_image,
                  updatedAt: it.updated_at,
                  isAddedOnScan: it.is_added_on_scan === true,
                  scanExempt: it.scan_exempt === true,
                  inspectionExempt: true,
                }}
                highlighted={false}
              />
            ))}
          </div>
        </>
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
          onBlockedScan={handleBlockedScan}
        />
      )}
      {overQty && (
        <OverQuantityModal
          itemName={overQty.itemName}
          quantity={overQty.quantity}
          scannedCount={overQty.scannedCount}
          onCancel={handleOverQtyCancel}
          onConfirm={handleOverQtyConfirm}
          onBlockedScan={handleBlockedScan}
        />
      )}
      {invoiceChange && (
        <InvoiceChangeModal
          currentInvoice={invoiceChange.currentInvoice}
          nextInvoice={invoiceChange.nextInvoice}
          onCancel={handleInvoiceChangeCancel}
          onConfirm={handleInvoiceChangeConfirm}
          onBlockedScan={handleBlockedScan}
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
          onBlockedScan={handleBlockedScan}
        />
      )}
      {manualTarget && (
        <QuantityModal
          // 완료 품목을 메뉴에서 고른 경우엔 "수량 수정", 그 외엔 "수동 챙김"
          title={
            manualTarget.scanned_count >= manualTarget.quantity &&
            manualTarget.quantity > 0
              ? "수량 수정"
              : "수동 챙김"
          }
          item={{
            invoice_item_id: manualTarget.invoice_item_id,
            name: manualTarget.name,
            quantity: manualTarget.quantity,
            scanned_count: manualTarget.scanned_count,
            scan_exempt: manualTarget.scan_exempt === true,
          }}
          onConfirm={handleManualPick}
          onClose={() => setManualTarget(null)}
        />
      )}
      {excludeTarget && (
        <ExcludeItemModal
          itemName={excludeTarget.name}
          quantity={excludeTarget.quantity}
          scannedCount={excludeTarget.scanned_count}
          onCancel={() => setExcludeTarget(null)}
          onConfirm={handleExclude}
        />
      )}
      {menuTarget && (
        <ScanItemMenuModal
          itemName={menuTarget.name}
          onEditQty={() => {
            const t = menuTarget;
            setMenuTarget(null);
            setManualTarget(t);
          }}
          onCancelItem={() => {
            const t = menuTarget;
            setMenuTarget(null);
            setExcludeTarget(t);
          }}
          onClose={() => setMenuTarget(null)}
        />
      )}
      {invoice && addModalOpen && (
        <AddItemModal
          onClose={() => setAddModalOpen(false)}
          invoiceId={invoice.id}
          existingItemIds={new Set(items.map((it) => it.item_id))}
          onAdded={handleItemAdded}
        />
      )}
    </div>
  );
}
