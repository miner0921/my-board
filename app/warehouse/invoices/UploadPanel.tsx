"use client";

import { useState } from "react";
import { Check, X, Plus, Loader2 } from "lucide-react";
import { type ToastData, summaryToToast } from "../_components/Toast";

// ─────────────────────────────────────────────────────────────
// 발주서/송장 업로드 패널 (각 여러 개 가능).
//   - 둘 다(각 1개 이상) → "등록하기": 모든 파일을 confirm으로 전송(서버가 합쳐 매칭).
//   - 한쪽만 → "○○만 대기로 저장": 그 파일들을 한 대기 묶음으로 저장(stash).
//   - 결과는 토스트(onToast). 성공 시 onSuccess()로 목록 갱신.
//   ★ 검수·파싱·매칭 로직과 무관 — UI/호출 흐름만(서버는 STAGE 1에서 N대응).
// ─────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024;

export default function UploadPanel({
  onSuccess,
  onToast,
}: {
  onSuccess: () => void;
  onToast: (t: ToastData) => void;
}) {
  const [orderFiles, setOrderFiles] = useState<File[]>([]);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function addFiles(kind: "order" | "invoice", list: FileList | null) {
    if (!list || list.length === 0) return;
    setError("");
    const cur = kind === "order" ? orderFiles : invoiceFiles;
    const next = [...cur];
    let bad = "";
    for (const f of Array.from(list)) {
      if (!f.name.toLowerCase().endsWith(".xlsx")) {
        bad = "엑셀(.xlsx) 파일만 업로드할 수 있습니다.";
        continue;
      }
      if (f.size > MAX_BYTES) {
        bad = "파일은 10MB 이하만 업로드할 수 있습니다.";
        continue;
      }
      next.push(f);
    }
    if (bad) setError(bad);
    (kind === "order" ? setOrderFiles : setInvoiceFiles)(next);
  }

  function removeFile(kind: "order" | "invoice", idx: number) {
    if (kind === "order") setOrderFiles(orderFiles.filter((_, i) => i !== idx));
    else setInvoiceFiles(invoiceFiles.filter((_, i) => i !== idx));
  }

  // 둘 다(각 1개 이상) → 바로 등록. 모든 파일을 confirm으로 전송.
  async function handleRegister() {
    if (orderFiles.length === 0 || invoiceFiles.length === 0) return;
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      for (const f of orderFiles) fd.append("order", f);
      for (const f of invoiceFiles) fd.append("invoice", f);
      const res = await fetch("/api/warehouse/invoices/confirm", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "등록에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      onToast(summaryToToast(data.summary));
      onSuccess();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  // 한쪽만 → 대기 저장(stash). 여러 개면 첫 파일로 묶음 생성 후 나머지 append.
  async function handleStash() {
    const kind: "order" | "invoice" =
      orderFiles.length > 0 ? "order" : "invoice";
    const files = kind === "order" ? orderFiles : invoiceFiles;
    if (files.length === 0) return;
    setError("");
    setSubmitting(true);
    try {
      let batchId: number | null = null;
      for (const f of files) {
        const fd = new FormData();
        fd.append("kind", kind);
        fd.append("file", f);
        if (batchId != null) fd.append("batchId", String(batchId));
        const res = await fetch("/api/warehouse/upload-batches", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "저장에 실패했습니다.");
          setSubmitting(false);
          return;
        }
        if (batchId == null) batchId = data.id;
      }
      onToast(
        kind === "order"
          ? {
              tone: "blue",
              title: "발주서를 저장했습니다.",
              desc: "송장을 업로드 하세요.",
            }
          : {
              tone: "blue",
              title: "송장을 저장했습니다.",
              desc: "발주서를 업로드 하세요.",
            }
      );
      onSuccess();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  const both = orderFiles.length > 0 && invoiceFiles.length > 0;
  const oneOnly =
    (orderFiles.length > 0) !== (invoiceFiles.length > 0);
  const presentLabel = orderFiles.length > 0 ? "발주서" : "송장";

  return (
    <div>
      <p className="text-sm text-zinc-500 mb-4">
        발주서와 송장을 모두 올리면 등록됩니다. 여러 개씩 올릴 수 있어요. 한쪽만
        올리면 대기 상태로 저장돼요.
      </p>

      {/* 두 파일 칸(각 N개) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <FileColumn
          label="발주서"
          files={orderFiles}
          onAdd={(e) => addFiles("order", e.target.files)}
          onRemove={(i) => removeFile("order", i)}
          disabled={submitting}
        />
        <FileColumn
          label="송장"
          files={invoiceFiles}
          onAdd={(e) => addFiles("invoice", e.target.files)}
          onRemove={(i) => removeFile("invoice", i)}
          disabled={submitting}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 등록 직전 매칭 안내 */}
      {both && (
        <p className="text-xs text-zinc-400 text-center mb-2">
          발주서 {orderFiles.length}개 · 송장 {invoiceFiles.length}개 — 합쳐서
          주문번호로 매칭됩니다.
        </p>
      )}

      {/* 상태별 버튼 1개 */}
      <div className="flex justify-center">
        {oneOnly ? (
          <button
            onClick={handleStash}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting && (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            )}
            {submitting ? "저장 중..." : `${presentLabel}만 대기로 저장`}
          </button>
        ) : (
          <button
            onClick={handleRegister}
            disabled={!both || submitting}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting && (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            )}
            {submitting ? "등록 중..." : "등록하기"}
          </button>
        )}
      </div>
    </div>
  );
}

// 한 종류(발주서/송장) 파일 리스트 + 추가 버튼.
function FileColumn({
  label,
  files,
  onAdd,
  onRemove,
  disabled,
}: {
  label: string;
  files: File[];
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (idx: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="border border-dashed border-zinc-300 rounded-lg p-4 bg-white">
      <p className="text-sm font-medium text-zinc-700 mb-2">{label} (.xlsx)</p>

      {files.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-zinc-700 truncate flex items-center gap-1 min-w-0">
                <Check
                  size={13}
                  strokeWidth={2}
                  className="text-green-600 shrink-0"
                />
                <span className="truncate">{f.name}</span>
                <span className="text-zinc-400 shrink-0">
                  ({(f.size / 1024).toFixed(0)} KB)
                </span>
              </span>
              <button
                onClick={() => onRemove(i)}
                disabled={disabled}
                className="text-zinc-400 hover:text-red-600 shrink-0 disabled:opacity-50"
                aria-label="파일 제거"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-zinc-300 text-xs font-medium text-zinc-600 cursor-pointer hover:bg-zinc-50 ${
          disabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <Plus size={13} strokeWidth={2} />
        {label} 추가
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={onAdd}
          disabled={disabled}
          className="hidden"
        />
      </label>
    </div>
  );
}
