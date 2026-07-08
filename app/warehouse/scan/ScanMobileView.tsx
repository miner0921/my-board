"use client";

import { CheckCircle2, AlertCircle, Circle, Hand, X } from "lucide-react";
import { initAudio } from "@/lib/feedback";
import {
  hasAnyBarcode,
  type ItemPayload,
  type ScanSession,
} from "./useScanSession";
import InvoiceNotice from "./InvoiceNotice";
import WrongItemModal from "./WrongItemModal";
import InvoiceChangeModal from "./InvoiceChangeModal";
import PartialCompleteModal from "./PartialCompleteModal";
import CancelInvoiceModal from "./CancelInvoiceModal";
import OverQuantityModal from "./OverQuantityModal";
import AddItemModal from "./AddItemModal";
import QuantityModal from "./QuantityModal";
import ExcludeItemModal from "./ExcludeItemModal";
import ScanItemMenuModal from "./ScanItemMenuModal";

// ─────────────────────────────────────────────────────────────
// 모바일 검수 뷰 (컴팩트 세로 배치).
//   - useScanSession() 을 직접 호출해 상태·로직을 PC page.tsx와 동일하게 공유.
//     (검수 로직을 새로 짜지 않고 훅 반환값·핸들러·setter를 그대로 소비)
//   - 카메라 자리는 이번 단계에선 빈 플레이스홀더만(다음 단계에서 실제 카메라).
//   - 모달 8종은 PC와 같은 컴포넌트를 이 뷰의 훅 인스턴스에 배선해 렌더한다.
//     (한 번에 한 뷰만 마운트되므로 마운트된 뷰가 자기 모달을 그려야 함)
// PC 화면(scan/page.tsx)은 건드리지 않는다.
// ─────────────────────────────────────────────────────────────
export default function ScanMobileView({ session }: { session: ScanSession }) {
  const {
    invoice,
    items,
    input,
    setInput,
    loading,
    statusMsg,
    statusKind,
    completeBanner,
    inputRef,
    modalOpen,
    isSessionDone,
    progressPct,
    showAuxButtons,
    remainingItems,
    completedItems,
    exemptItems,
    lastScannedId,
    setAddModalOpen,
    setPartialOpen,
    setManualTarget,
    setExcludeTarget,
    setMenuTarget,
    setCancelOpen,
    handleKeyDown,
    // 모달 상태 + 핸들러 (PC와 동일)
    wrongItem,
    overQty,
    invoiceChange,
    partialOpen,
    cancelOpen,
    manualTarget,
    addModalOpen,
    excludeTarget,
    menuTarget,
    handleBlockedScan,
    handleInvoiceChangeConfirm,
    handleInvoiceChangeCancel,
    handleWrongItemConfirm,
    handleWrongItemCancel,
    handleOverQtyConfirm,
    handleOverQtyCancel,
    handleCancelInvoiceConfirm,
    handlePartialCompleted,
    handleExclude,
    handleItemAdded,
    handleManualPick,
  } = session;

  const statusColor =
    statusKind === "ok"
      ? "text-green-700"
      : statusKind === "error"
        ? "text-red-700"
        : "text-zinc-600";

  const progressBarColor =
    invoice?.status === "completed_partial"
      ? "bg-amber-500"
      : progressPct > 0
        ? "bg-green-500"
        : "bg-zinc-300";

  return (
    // 방안 C: ScanMobileView 자체 스크롤 컨테이너.
    //   높이 = 100dvh - (모바일바 56 + 제목 header 71 + 콘텐츠 py-6 상단 24 + 하단 24) = 176px.
    //     · AppShell 모바일바: h-14(56, border-box)
    //     · AppShell 제목 header: py-5(40) + h1 line(28) + mt-0.5(2) + border-b(1) = 71
    //     · AppShell 콘텐츠 래퍼 py-6: 상단 24 + 하단 24
    //   상단 3블록은 이 컨테이너 안에서 sticky top-0 으로 고정, 품목만 내부 스크롤.
    //   제목(header)은 컨테이너 밖 위에 남아 고정 효과 → "제목 아래 통째 고정".
    //   100dvh 로 모바일 주소창 변화 대응. body 는 안 흔들리고 이 컨테이너만 스크롤.
    <div className="max-w-md mx-auto pb-8 h-[calc(100dvh-176px)] overflow-y-auto">
      {/* 상단 고정 영역 — 카메라 + 입력칸 + 송장 정보를 하나의 sticky 래퍼로 묶어
          상단 고정. 스크롤해도 항상 보이며, 불투명 배경(bg-white) + z-index 로
          품목이 고정 영역 뒤로 비쳐 보이지 않게. */}
      <div className="sticky top-0 z-20 bg-white pt-0.5 pb-2">
        {/* 1) 카메라 자리 — 빈 플레이스홀더 (다음 단계에서 실제 카메라) */}
        <div className="mt-1 aspect-[2/1] w-full rounded-lg bg-zinc-100 border border-dashed border-zinc-300 flex flex-col items-center justify-center text-zinc-400">
          <span className="text-sm font-medium">카메라</span>
          <span className="text-xs mt-0.5">준비 중</span>
        </div>

        {/* 2) 바코드 직접 입력칸 — 기존 입력 흐름(handleKeyDown → sendScan) 연결 */}
        <div className="mt-2">
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
                ? "다음 송장 바코드"
                : invoice
                  ? "품목 또는 다른 송장 바코드"
                  : "송장 바코드"
            }
            className="w-full text-base font-mono px-3 py-3 border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900 disabled:opacity-50"
          />
          {statusMsg && (
            <p
              className={`mt-1.5 text-sm font-semibold flex items-center gap-1 ${statusColor}`}
            >
              {statusKind === "ok" && (
                <CheckCircle2 size={16} strokeWidth={2} className="shrink-0" />
              )}
              {statusKind === "error" && (
                <AlertCircle size={16} strokeWidth={2} className="shrink-0" />
              )}
              <span className="min-w-0">{statusMsg}</span>
            </p>
          )}
        </div>

        {/* 3) 송장 정보 한 줄 + 진행률 바 */}
        <div className="pt-1">
          {/* 송장정보 박스: 아래 테두리(border-b)만 제거해 바로 아래 버튼과 붙임.
              상·좌·우 테두리(border-x border-t)는 유지 — 다른 border는 안 건드림. */}
          <div className="border-x border-t border-zinc-200 rounded-lg overflow-hidden">
            {invoice ? (
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-mono text-zinc-800 truncate">
                    {invoice.invoice_no}
                  </span>
                  {invoice.recipient_name && (
                    <span className="text-xs text-zinc-500 truncate shrink-0">
                      {invoice.recipient_name}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs font-semibold">
                    {invoice.status === "completed" ? (
                      <span className="text-green-700">
                        완료 {invoice.scanned_qty}/{invoice.total_qty}
                      </span>
                    ) : invoice.status === "completed_partial" ? (
                      <span className="text-amber-700">
                        부분 {invoice.scanned_qty}/{invoice.total_qty}
                      </span>
                    ) : invoice.status === "manual_completed" ? (
                      <span className="text-purple-700">
                        수동 {invoice.scanned_qty}/{invoice.total_qty}
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        검수중 {invoice.scanned_qty}/{invoice.total_qty}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-sm text-zinc-500">
                송장 바코드를 스캔/입력하세요
              </div>
            )}
            {/* 진행률 바 */}
            {invoice && (
              <div className="h-1 bg-zinc-100">
                <div
                  className={`h-full transition-all ${progressBarColor}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* 완료 안내 (컴팩트) — 완료 세션이면 다음 송장 유도 */}
          {isSessionDone && completeBanner && (
            <div
              className={`mt-2 rounded-lg px-3 py-2 text-sm border ${
                completeBanner.kind === "partial"
                  ? "bg-amber-50 border-amber-300 text-amber-900"
                  : "bg-green-50 border-green-300 text-green-900"
              }`}
            >
              <span className="font-bold">
                {completeBanner.kind === "partial" ? "결품 완료!" : "송장 완료!"}
              </span>{" "}
              <span className="text-xs opacity-80">
                다음 송장 바코드를 스캔하세요
              </span>
            </div>
          )}
        </div>
        {/* 4) 보조 버튼 — 품목 추가 / 결품 완료 (버튼까지 고정 영역에 포함).
            송장정보 바로 아래에 붙임(mt-1) + 컴팩트 높이(py-1 ≈ 30px). */}
        {invoice && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              disabled={modalOpen}
              className="flex-1 text-sm px-3 py-1 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-40"
            >
              + 품목 추가
            </button>
            {showAuxButtons && (
              <button
                type="button"
                onClick={() => setPartialOpen(true)}
                className="flex-1 text-sm px-3 py-1 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition"
              >
                결품 완료
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5) 송장 안내(관리자→작업자) — 재개 사유 + 관리자 메모. 고정 영역 아래에서 스크롤.
          둘 다 없으면 InvoiceNotice 가 내부에서 null 반환(박스 미표시). */}
      {invoice && (
        <div className="mt-2">
          <InvoiceNotice
            reopenReason={invoice.reopen_reason}
            adminMemo={invoice.admin_memo}
          />
        </div>
      )}

      {/* 6) 컴팩트 품목 리스트 */}
      {invoice && (
        <div className="mt-3 space-y-3">
          {/* 남은 상품 */}
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">남은 상품</p>
            {remainingItems.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-green-300 bg-green-50 rounded-lg text-green-700 text-sm">
                남은 상품이 없습니다.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {remainingItems.map((it) => (
                  <MobileItemRow
                    key={it.invoice_item_id}
                    item={it}
                    highlighted={lastScannedId === it.invoice_item_id}
                    onTap={() => setManualTarget(it)}
                    onExclude={() => setExcludeTarget(it)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* 완료된 상품 — 탭하면 메뉴(수량 수정/취소) */}
          {completedItems.length > 0 && (
            <div>
              <p className="text-[11px] text-zinc-500 mb-1">완료된 상품</p>
              <ul className="space-y-1.5">
                {completedItems.map((it) => (
                  <MobileItemRow
                    key={it.invoice_item_id}
                    item={it}
                    highlighted={lastScannedId === it.invoice_item_id}
                    onTap={() => setMenuTarget(it)}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* 스캔불필요 — 흐리게, 동작 없음 */}
          {exemptItems.length > 0 && (
            <div>
              <p className="text-[11px] text-zinc-500 mb-1">
                스캔불필요 상품{" "}
                <span className="text-zinc-400">(검수 대상 아님)</span>
              </p>
              <ul className="space-y-1.5 opacity-60">
                {exemptItems.map((it) => (
                  <MobileItemRow key={it.invoice_item_id} item={it} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 모달 8종 — PC와 같은 컴포넌트, 이 뷰의 훅 인스턴스에 배선 */}
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

// 컴팩트 품목 행 — 작은 이미지 + 품명 + 진행(N/M) + 취소(⊖)가 한 행.
//   onTap 있으면 행 전체가 버튼(수동 입력/메뉴). onExclude 있으면 우측 취소 버튼.
function MobileItemRow({
  item,
  highlighted = false,
  onTap,
  onExclude,
}: {
  item: ItemPayload;
  highlighted?: boolean;
  onTap?: () => void;
  onExclude?: () => void;
}) {
  const complete =
    item.scanned_count >= item.quantity && item.quantity > 0;
  const over = item.scanned_count > item.quantity && item.quantity > 0;
  const manual = !hasAnyBarcode(item); // 바코드 전혀 없음 → 수동 챙김 대상
  const clickable = !!onTap;

  const borderClass = over
    ? "border-red-400 bg-red-50"
    : complete
      ? "border-green-400 bg-green-50"
      : manual
        ? "border-blue-300"
        : item.is_added_on_scan
          ? "border-amber-400"
          : "border-zinc-200";

  return (
    <li
      onClick={clickable ? onTap : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTap?.();
              }
            }
          : undefined
      }
      className={`flex items-center gap-2 p-2 border rounded-lg bg-white transition-all ${borderClass} ${
        highlighted ? "shadow-md" : ""
      } ${clickable ? "cursor-pointer active:bg-zinc-50" : ""}`}
    >
      {/* 작은 이미지 */}
      <div className="w-11 h-11 shrink-0 rounded bg-zinc-50 border border-zinc-100 overflow-hidden flex items-center justify-center">
        {item.has_image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/warehouse/items/${item.item_id}/image?v=${new Date(item.updated_at).getTime()}`}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[9px] text-zinc-300">없음</span>
        )}
      </div>

      {/* 품명 + 배지 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-900 truncate leading-snug">
          {item.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
              over
                ? "bg-red-50 text-red-700 border-red-200"
                : complete
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-zinc-50 text-zinc-600 border-zinc-200"
            }`}
          >
            {item.scanned_count}/{item.quantity}
          </span>
          {manual && !complete && onTap && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-blue-700">
              <Hand size={11} strokeWidth={1.75} />
              탭하여 입력
            </span>
          )}
          {item.scan_exempt && (
            <span className="px-1 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-200">
              동봉
            </span>
          )}
          {item.is_added_on_scan && (
            <span className="px-1 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200">
              현장
            </span>
          )}
        </div>
      </div>

      {/* 완료 표시 */}
      <div className="shrink-0">
        {complete ? (
          <CheckCircle2 size={18} strokeWidth={2} className="text-green-600" />
        ) : (
          <Circle size={18} strokeWidth={2} className="text-zinc-300" />
        )}
      </div>

      {/* 취소(⊖) — 남은 품목 행에만 */}
      {onExclude && (
        <button
          type="button"
          aria-label="취소 (송장에서 빼기)"
          title="취소 (송장에서 빼기)"
          onClick={(e) => {
            e.stopPropagation();
            onExclude();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-zinc-300 text-zinc-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition"
        >
          <X size={15} strokeWidth={2.25} />
        </button>
      )}
    </li>
  );
}
