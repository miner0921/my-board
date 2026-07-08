"use client";

import WrongItemModal from "./WrongItemModal";
import InvoiceChangeModal from "./InvoiceChangeModal";
import PartialCompleteModal from "./PartialCompleteModal";
import CancelInvoiceModal from "./CancelInvoiceModal";
import OverQuantityModal from "./OverQuantityModal";
import OrderText from "./OrderText";
import InvoiceNotice from "./InvoiceNotice";
import AddItemModal from "./AddItemModal";
import ScanItemCard from "./ScanItemCard";
import QuantityModal from "./QuantityModal";
import ExcludeItemModal from "./ExcludeItemModal";
import ScanItemMenuModal from "./ScanItemMenuModal";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { initAudio } from "@/lib/feedback";
import { hasAnyBarcode, type ScanSession } from "./useScanSession";

// ─────────────────────────────────────────────────────────────
// 단일 입력란 구조의 검수 화면.
//   - 송장/품목 구분 없이 한 입력란에서 모든 바코드 스캔
//   - 서버가 바코드 종류 판별 (POST /api/warehouse/scan)
//   - 응답 type에 따라 화면/사운드/진동/모달 처리
// 상태·로직은 useScanSession 훅에 있고, 이 파일은 화면(JSX)만 그린다.
// ─────────────────────────────────────────────────────────────

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

export default function ScanDesktopView({ session }: { session: ScanSession }) {
  const {
    invoice,
    items,
    rawLines,
    input,
    setInput,
    loading,
    statusMsg,
    statusKind,
    flash,
    lastScannedId,
    wrongItem,
    overQty,
    invoiceChange,
    partialOpen,
    setPartialOpen,
    cancelOpen,
    setCancelOpen,
    completeBanner,
    manualTarget,
    setManualTarget,
    addModalOpen,
    setAddModalOpen,
    excludeTarget,
    setExcludeTarget,
    menuTarget,
    setMenuTarget,
    inputRef,
    modalOpen,
    isSessionDone,
    progressPct,
    showAuxButtons,
    activeItems,
    exemptItems,
    remainingItems,
    completedItems,
    handleKeyDown,
    handleBlockedScan,
    handleInvoiceChangeConfirm,
    handleInvoiceChangeCancel,
    handleWrongItemConfirm,
    handleWrongItemCancel,
    handleOverQtyConfirm,
    handleOverQtyCancel,
    handleCancelInvoiceConfirm,
    handleCancelInvoiceClick,
    handlePartialCompleted,
    handleExclude,
    handleItemAdded,
    handleManualPick,
  } = session;

  // ── 화면 ─────────────────────────────────────────────────
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
