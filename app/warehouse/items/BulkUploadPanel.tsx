"use client";

import { useState } from "react";
import { Check, X, FileSpreadsheet } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 품목 대량 등록 패널 (파일 선택 → 미리보기 → 확정 → 결과).
//   - 헤더: 품목코드 / 바코드 / 구분 / 종류 (.xlsx 또는 .csv, 19컬럼 중 4개만 사용)
//   - 판단 기준은 품목코드. 같은 코드면 갱신, 없으면 신규.
//   - 성공 시 onSuccess() 호출 (부모가 목록 갱신).
// ─────────────────────────────────────────────────────────────

type PreviewRow = {
  rowNo: number;
  productCode: string | null;
  category: string;
  kind: string;
  name: string;
  barcode: string | null;
  action: "create" | "update" | "skip";
  reason: string | null;
};

type PreviewData = {
  counts: { create: number; update: number; skip: number };
  total: number;
  rows: PreviewRow[];
  truncated: boolean;
};

type ResultData = { inserted: number; updated: number; skipped: number };

const ACTION_BADGE: Record<PreviewRow["action"], { label: string; cls: string }> = {
  create: { label: "신규", cls: "bg-blue-50 text-blue-700" },
  update: { label: "갱신", cls: "bg-amber-50 text-amber-700" },
  skip: { label: "건너뜀", cls: "bg-zinc-100 text-zinc-500" },
};

export default function BulkUploadPanel({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    setPreview(null);
    setResult(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      setError("엑셀(.xlsx) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function handleAnalyze() {
    if (!file) return;
    setError("");
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/warehouse/items/bulk/preview", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "분석에 실패했습니다.");
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
    if (!file || !preview) return;
    setError("");
    setConfirming(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/warehouse/items/bulk", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "등록에 실패했습니다.");
        setConfirming(false);
        return;
      }
      setResult(data.result);
      onSuccess(); // 목록 갱신 (모달은 결과 확인 위해 유지)
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setConfirming(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
  }

  // 결과 화면
  if (result) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4 text-green-700">
          <Check size={20} strokeWidth={2} />
          <span className="font-semibold">대량 등록 완료</span>
        </div>
        <ul className="space-y-1.5 text-sm text-zinc-700 mb-6">
          <li>· 신규 등록: <span className="font-semibold">{result.inserted}</span>건</li>
          <li>· 갱신(구분/종류/바코드): <span className="font-semibold">{result.updated}</span>건</li>
          <li>· 건너뜀: <span className="font-semibold">{result.skipped}</span>건</li>
        </ul>
        <div className="flex justify-end">
          <button
            onClick={handleReset}
            className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            다른 파일 올리기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-500 mb-4">
        엑셀(.xlsx) 또는 CSV 파일. 1행은 헤더, 2행부터 데이터. 헤더 이름으로{" "}
        <b>품목코드</b> / <b>바코드</b> / <b>구분</b> / <b>종류</b> 4개 열만 사용합니다(나머지 열 무시).
        같은 <b>품목코드</b>가 이미 있으면 갱신하고, 없으면 새로 등록합니다. 품명은 “(구분)종류”로
        저장됩니다. 바코드는 비어 있어도 됩니다.
      </p>

      {/* 파일 선택 */}
      <div className="border border-dashed border-zinc-300 rounded-lg p-5 bg-white mb-4">
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={onPick}
          disabled={analyzing || confirming}
          className="block w-full text-xs text-zinc-700 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-zinc-300 file:bg-white file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-50 file:cursor-pointer disabled:opacity-50"
        />
        {file && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-700">
            <FileSpreadsheet size={14} strokeWidth={1.75} className="text-zinc-400" />
            {file.name}{" "}
            <span className="text-zinc-400">({(file.size / 1024).toFixed(0)} KB)</span>
            <button
              type="button"
              onClick={handleReset}
              className="ml-1 text-zinc-400 hover:text-red-600"
              aria-label="파일 제거"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {!preview && (
        <div className="flex justify-center">
          <button
            onClick={handleAnalyze}
            disabled={!file || analyzing}
            className="px-8 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {analyzing ? "분석 중..." : "분석하기"}
          </button>
        </div>
      )}

      {preview && (
        <section className="border border-zinc-200 rounded-lg p-5 bg-white">
          <h3 className="text-base font-semibold mb-3">분석 결과</h3>
          <ul className="space-y-1.5 text-sm mb-4">
            <li>
              신규 등록:{" "}
              <span className="font-semibold text-blue-700">
                {preview.counts.create}
              </span>
              건
            </li>
            <li>
              바코드 덮어쓰기:{" "}
              <span className="font-semibold text-amber-700">
                {preview.counts.update}
              </span>
              건
            </li>
            <li>
              건너뜀:{" "}
              <span className="font-semibold text-zinc-500">
                {preview.counts.skip}
              </span>
              건{" "}
              <span className="text-xs text-zinc-400">(품목코드/종류 없음·길이 초과)</span>
            </li>
            <li className="text-xs text-zinc-400">총 {preview.total}행</li>
          </ul>

          {/* 행별 상세 */}
          <div className="max-h-[300px] overflow-auto border border-zinc-200 rounded text-xs">
            <div className="grid grid-cols-[2.5rem_6rem_1fr_6rem_4rem] gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-200 font-medium text-zinc-600 sticky top-0">
              <span>행</span>
              <span>품목코드</span>
              <span>품명 (구분)종류</span>
              <span>바코드</span>
              <span className="text-center">처리</span>
            </div>
            {preview.rows.map((r) => {
              const badge = ACTION_BADGE[r.action];
              return (
                <div
                  key={r.rowNo}
                  className="grid grid-cols-[2.5rem_6rem_1fr_6rem_4rem] gap-2 px-3 py-1.5 border-b border-zinc-100 last:border-b-0 items-center"
                >
                  <span className="text-zinc-400">{r.rowNo}</span>
                  <span className="font-mono text-zinc-500 truncate" title={r.productCode ?? ""}>
                    {r.productCode ?? <span className="text-zinc-300">-</span>}
                  </span>
                  <span className="truncate text-zinc-700" title={r.name}>
                    {r.name || <span className="text-zinc-300">(빈 품명)</span>}
                  </span>
                  <span className="font-mono text-zinc-500 truncate">
                    {r.barcode ?? <span className="text-zinc-300">-</span>}
                  </span>
                  <span className="text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {r.reason && (
                      <span className="block text-[10px] text-zinc-400 mt-0.5">
                        {r.reason}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {preview.truncated && (
            <p className="text-xs text-zinc-400 mt-2">
              상위 200행만 미리보기에 표시됩니다. 등록은 전체 행에 적용됩니다.
            </p>
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
              disabled={confirming || preview.counts.create + preview.counts.update === 0}
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
