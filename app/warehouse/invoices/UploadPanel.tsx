"use client";

import { useState } from "react";
import { Check, X, Upload } from "lucide-react";
import { type ToastData, summaryToToast } from "../_components/Toast";

// ─────────────────────────────────────────────────────────────
// 발주서/송장 업로드 패널.
//   - 둘 다 올리면 "등록하기" → 바로 등록(미리보기 없이 confirm 직접 호출).
//   - 한쪽만 올리면 "○○만 대기로 저장" → 대기 저장(stash).
//   - 결과는 토스트(onToast)로 알림. 성공 시 onSuccess()로 목록 갱신.
//   ★ 검수·파싱·매칭 로직과 무관 — UI/호출 흐름만.
// ─────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024;

export default function UploadPanel({
  onSuccess,
  onToast,
}: {
  onSuccess: () => void;
  onToast: (t: ToastData) => void;
}) {
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function validateAndSet(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void
  ) {
    setError("");
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // 같은 파일 다시 선택 가능하게
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("엑셀(.xlsx) 파일만 업로드할 수 있습니다.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("파일은 10MB 이하만 업로드할 수 있습니다.");
      return;
    }
    setter(f);
  }

  // 둘 다 올렸을 때 → 바로 등록(미리보기 없이 confirm 직접 호출)
  async function handleRegister() {
    if (!orderFile || !invoiceFile) return;
    setError("");
    setSubmitting(true);
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

  // 한쪽만 올렸을 때 → 대기 저장(stash). 파싱/등록 없음.
  async function handleStash() {
    const file = orderFile ?? invoiceFile;
    const kind = orderFile ? "order" : "invoice";
    if (!file) return;
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
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

  const bothReady = !!orderFile && !!invoiceFile;
  const oneOnly = !!orderFile !== !!invoiceFile;
  const presentLabel = orderFile ? "발주서" : "송장";

  return (
    <div>
      <p className="text-sm text-zinc-500 mb-4">
        발주서와 송장을 모두 올리면 바로 등록됩니다. 한쪽만 올리면 대기 상태로
        저장돼요.
      </p>

      {/* 두 파일 칸 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <FileBox
          label="발주서 (.xlsx)"
          file={orderFile}
          onChange={(e) => validateAndSet(e, setOrderFile)}
          onClear={() => setOrderFile(null)}
          disabled={submitting}
        />
        <FileBox
          label="송장 (.xlsx)"
          file={invoiceFile}
          onChange={(e) => validateAndSet(e, setInvoiceFile)}
          onClear={() => setInvoiceFile(null)}
          disabled={submitting}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 상태별 버튼 1개 */}
      <div className="flex justify-center">
        {oneOnly ? (
          <button
            onClick={handleStash}
            disabled={submitting}
            className="px-8 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "저장 중..." : `${presentLabel}만 대기로 저장`}
          </button>
        ) : (
          <button
            onClick={handleRegister}
            disabled={!bothReady || submitting}
            className="px-8 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? "등록 중..." : "등록하기"}
          </button>
        )}
      </div>
    </div>
  );
}

// 파일 칸: "파일 선택" 버튼 + (선택 시) "✓ 파일명 (크기) [x]" 한 줄.
// 네이티브 input은 숨겨 파일명 중복 표시를 막는다.
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

      {props.file ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-zinc-700 truncate flex items-center gap-1 min-w-0">
            <Check size={13} strokeWidth={2} className="text-green-600 shrink-0" />
            <span className="truncate">{props.file.name}</span>
            <span className="text-zinc-400 shrink-0">
              ({(props.file.size / 1024).toFixed(0)} KB)
            </span>
          </span>
          <button
            onClick={props.onClear}
            disabled={props.disabled}
            className="text-zinc-400 hover:text-red-600 shrink-0 disabled:opacity-50"
            aria-label="파일 제거"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded border border-zinc-300 text-xs font-medium text-zinc-700 cursor-pointer hover:bg-zinc-50 ${
            props.disabled ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <Upload size={13} strokeWidth={2} />
          파일 선택
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={props.onChange}
            disabled={props.disabled}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
