"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  StickyNote,
  Check,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 발주서/송장 업로드 패널 (분석 → 미리보기 → 등록 확정).
//   - 기존 /warehouse/upload 페이지 로직을 그대로 옮겨 모달에서 재사용.
//   - 성공 시 onSuccess() 호출 (부모가 모달 닫고 목록/이력 갱신).
// ─────────────────────────────────────────────────────────────

type PreviewItem = {
  rawName: string;
  normalizedName: string;
  qty: number;
  isNew: boolean;
};

type MatchedDetail = {
  invoiceNo: string;
  orderNo: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  customerType: string | null;
  items: PreviewItem[];
  notes: string[];
};

type OnlyInInvoiceDetail = {
  invoiceNo: string;
  orderNo: string;
  recipientName: string;
  recipientAddress: string;
  items: PreviewItem[];
  notes: string[];
};

type OnlyInOrderDetail = {
  orderNo: string;
  recipientName: string;
  productNameRaw: string;
  customerType: string | null;
};

type PreviewData = {
  summary: {
    matchedCount: number;
    onlyInOrderCount: number;
    onlyInInvoiceCount: number;
    newItemsCount: number;
    totalNotes: number;
    sheetCounts: { business: number; individual: number; retail: number };
  };
  matched: MatchedDetail[];
  onlyInOrder: OnlyInOrderDetail[];
  onlyInInvoice: OnlyInInvoiceDetail[];
  newItems: string[];
};

const MAX_BYTES = 10 * 1024 * 1024;

export default function UploadPanel({ onSuccess }: { onSuccess: () => void }) {
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [showMatchedDetail, setShowMatchedDetail] = useState(false);
  const [showNewItems, setShowNewItems] = useState(false);

  function validateAndSet(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void
  ) {
    setError("");
    setPreview(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setter(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("엑셀(.xlsx) 파일만 업로드할 수 있습니다.");
      e.target.value = "";
      setter(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("파일은 10MB 이하만 업로드할 수 있습니다.");
      e.target.value = "";
      setter(null);
      return;
    }
    setter(f);
  }

  async function handleAnalyze() {
    if (!orderFile || !invoiceFile) return;
    setError("");
    setPreview(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("order", orderFile);
      fd.append("invoice", invoiceFile);
      const res = await fetch("/api/warehouse/invoices/preview", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "분석에 실패했습니다.");
        setAnalyzing(false);
        return;
      }
      setPreview(data);
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirm() {
    if (!orderFile || !invoiceFile || !preview) return;
    if (!confirm("이 분석 결과로 등록하시겠습니까?")) return;
    setError("");
    setConfirming(true);
    try {
      const fd = new FormData();
      fd.append("order", orderFile);
      fd.append("invoice", invoiceFile);
      const res = await fetch("/api/warehouse/invoices/confirm", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "등록에 실패했습니다.");
        setConfirming(false);
        return;
      }
      const s = data.summary;
      alert(
        `등록 완료\n` +
          `- 새 품목: ${s.insertedItems}개\n` +
          `- 등록 송장: ${s.insertedInvoices}건\n` +
          `- 중복 SKIP: ${s.skippedInvoices}건`
      );
      onSuccess();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setConfirming(false);
    }
  }

  function handleReset() {
    setOrderFile(null);
    setInvoiceFile(null);
    setPreview(null);
    setError("");
  }

  const canAnalyze = !!orderFile && !!invoiceFile && !analyzing && !confirming;

  return (
    <div>
      <p className="text-sm text-zinc-500 mb-4">
        발주서(.xlsx)와 송장(.xlsx)을 모두 올린 뒤 분석하기를 누르세요. 분석
        결과를 확인하고 등록 확정을 누르면 저장됩니다.
      </p>

      {/* 두 드롭존 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <FileBox
          label="1. 발주서 (.xlsx)"
          file={orderFile}
          onChange={(e) => validateAndSet(e, setOrderFile)}
          onClear={() => {
            setOrderFile(null);
            setPreview(null);
            setError("");
          }}
          disabled={analyzing || confirming}
        />
        <FileBox
          label="2. 송장 (.xlsx)"
          file={invoiceFile}
          onChange={(e) => validateAndSet(e, setInvoiceFile)}
          onClear={() => {
            setInvoiceFile(null);
            setPreview(null);
            setError("");
          }}
          disabled={analyzing || confirming}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {!preview && (
        <div className="flex justify-center mb-2">
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="px-8 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {analyzing ? "분석 중..." : "분석하기"}
          </button>
        </div>
      )}

      {preview && (
        <section className="border border-zinc-200 rounded-lg p-5 bg-white">
          <h3 className="text-base font-semibold mb-3">분석 결과</h3>

          {/* 시트별 발주서 건수 */}
          <p className="text-xs text-zinc-500 mb-4">
            발주서 시트별: 사업자 {preview.summary.sheetCounts.business}건 ·
            개인일반 {preview.summary.sheetCounts.individual}건 · 개인소매{" "}
            {preview.summary.sheetCounts.retail}건
          </p>

          {/* 요약 */}
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2
                size={16}
                strokeWidth={1.75}
                className="text-green-600 shrink-0"
              />
              <span>
                매칭된 송장:{" "}
                <span className="font-semibold">
                  {preview.summary.matchedCount}
                </span>
                건
              </span>
              {preview.matched.length > 0 && (
                <button
                  onClick={() => setShowMatchedDetail(!showMatchedDetail)}
                  className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-900"
                >
                  {showMatchedDetail ? "접기" : "상세 보기"}
                </button>
              )}
            </li>

            {preview.summary.onlyInOrderCount > 0 && (
              <li className="flex items-center gap-2">
                <AlertTriangle
                  size={16}
                  strokeWidth={1.75}
                  className="text-amber-500 shrink-0"
                />
                <span>
                  발주서에만 있음:{" "}
                  <span className="font-semibold">
                    {preview.summary.onlyInOrderCount}
                  </span>
                  건{" "}
                  <span className="text-xs text-zinc-500">
                    (송장 미발급, 등록 안 됨)
                  </span>
                </span>
              </li>
            )}

            {preview.summary.onlyInInvoiceCount > 0 && (
              <li className="flex items-center gap-2">
                <AlertTriangle
                  size={16}
                  strokeWidth={1.75}
                  className="text-amber-500 shrink-0"
                />
                <span>
                  송장에만 있음:{" "}
                  <span className="font-semibold">
                    {preview.summary.onlyInInvoiceCount}
                  </span>
                  건{" "}
                  <span className="text-xs text-zinc-500">
                    (발주서 없음, 그래도 등록됨)
                  </span>
                </span>
              </li>
            )}

            <li className="flex items-center gap-2">
              <Plus size={16} strokeWidth={2} className="text-zinc-500 shrink-0" />
              <span>
                새로 등록될 품목:{" "}
                <span className="font-semibold">
                  {preview.summary.newItemsCount}
                </span>
                개
              </span>
              {preview.summary.newItemsCount > 0 && (
                <button
                  onClick={() => setShowNewItems(!showNewItems)}
                  className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-900"
                >
                  {showNewItems ? "접기" : "목록 보기"}
                </button>
              )}
            </li>

            {preview.summary.totalNotes > 0 && (
              <li className="flex items-center gap-2">
                <StickyNote
                  size={16}
                  strokeWidth={1.75}
                  className="text-zinc-500 shrink-0"
                />
                <span>
                  메모 처리될 안내문:{" "}
                  <span className="font-semibold">
                    {preview.summary.totalNotes}
                  </span>
                  건{" "}
                  <span className="text-xs text-zinc-500">
                    (송장의 배송메시지에 합쳐짐)
                  </span>
                </span>
              </li>
            )}
          </ul>

          {/* 새 품목 목록 */}
          {showNewItems && preview.newItems.length > 0 && (
            <div className="mt-4 p-3 bg-zinc-50 rounded border border-zinc-200">
              <ul className="text-xs text-zinc-700 space-y-1">
                {preview.newItems.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 매칭 송장 상세 */}
          {showMatchedDetail && (
            <div className="mt-4 max-h-[360px] overflow-auto border border-zinc-200 rounded">
              {preview.matched.map((m) => (
                <div
                  key={m.invoiceNo}
                  className="p-3 border-b border-zinc-100 text-xs"
                >
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                    <span className="font-mono">{m.invoiceNo}</span>
                    <span className="text-zinc-500">/ {m.orderNo}</span>
                    <span className="text-zinc-700">{m.recipientName}</span>
                    {m.customerType && (
                      <span className="text-zinc-400">[{m.customerType}]</span>
                    )}
                  </div>
                  <ul className="ml-4 text-zinc-600 space-y-0.5">
                    {m.items.map((it, i) => (
                      <li key={i}>
                        · {it.rawName}
                        {it.rawName !== it.normalizedName && (
                          <span className="text-zinc-400"> → {it.normalizedName}</span>
                        )}
                        <span className="text-zinc-500"> ×{it.qty}</span>
                        {it.isNew && (
                          <span className="ml-1 px-1 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">
                            NEW
                          </span>
                        )}
                      </li>
                    ))}
                    {m.notes.map((n, i) => (
                      <li
                        key={`note-${i}`}
                        className="text-zinc-400 flex items-center gap-1"
                      >
                        <StickyNote size={11} strokeWidth={1.75} className="shrink-0" />
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {preview.onlyInInvoice.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-amber-50 border-y border-amber-200 text-xs text-amber-700">
                    [송장에만 있음 — 등록되지만 발주서 정보 없음]
                  </div>
                  {preview.onlyInInvoice.map((m) => (
                    <div
                      key={m.invoiceNo}
                      className="p-3 border-b border-zinc-100 text-xs"
                    >
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                        <span className="font-mono">{m.invoiceNo}</span>
                        <span className="text-zinc-500">/ {m.orderNo}</span>
                        <span className="text-zinc-700">{m.recipientName}</span>
                      </div>
                      <ul className="ml-4 text-zinc-600 space-y-0.5">
                        {m.items.map((it, i) => (
                          <li key={i}>
                            · {it.rawName} ×{it.qty}
                            {it.isNew && (
                              <span className="ml-1 px-1 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">
                                NEW
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}

              {preview.onlyInOrder.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-amber-50 border-y border-amber-200 text-xs text-amber-700">
                    [발주서에만 있음 — 송장 미발급, 등록되지 않음]
                  </div>
                  {preview.onlyInOrder.map((o, i) => (
                    <div key={i} className="p-3 border-b border-zinc-100 text-xs">
                      <span className="text-zinc-500 font-mono">{o.orderNo}</span>
                      <span className="ml-2 text-zinc-700">{o.recipientName}</span>
                      {o.customerType && (
                        <span className="ml-2 text-zinc-400">[{o.customerType}]</span>
                      )}
                      <div className="ml-4 text-zinc-500 mt-1">{o.productNameRaw}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-100">
            <button
              onClick={handleReset}
              disabled={confirming}
              className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition disabled:opacity-50"
            >
              다시 선택
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {confirming ? "등록 중..." : "등록 확정"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function FileBox(props: {
  label: string;
  file: File | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="border border-dashed border-zinc-300 rounded-lg p-5 bg-white">
      <p className="text-sm font-medium text-zinc-700 mb-3">{props.label}</p>
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={props.onChange}
        disabled={props.disabled}
        className="block w-full text-xs text-zinc-700 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-zinc-300 file:bg-white file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-50 file:cursor-pointer disabled:opacity-50"
      />
      {props.file && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-zinc-700 truncate flex items-center gap-1">
            <Check size={13} strokeWidth={2} className="text-green-600 shrink-0" />
            {props.file.name}{" "}
            <span className="text-zinc-400">
              ({(props.file.size / 1024).toFixed(0)} KB)
            </span>
          </span>
          <button
            onClick={props.onClear}
            disabled={props.disabled}
            className="text-zinc-400 hover:text-red-600 ml-2 disabled:opacity-50"
            aria-label="파일 제거"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
