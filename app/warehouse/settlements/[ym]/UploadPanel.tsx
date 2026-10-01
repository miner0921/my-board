"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

// 정산 엑셀 업로드.
// 한 파일에 시트 4개(유통가공/입출고/출고현황/협의건)가 있으면 한 번에 다 들어간다.
// 파일에 들어있는 시트만 갈아끼우므로, 일부 시트만 담긴 파일을 여러 번 올려도 된다.

type Result = {
  found: Record<string, boolean>;
  counts: Record<string, number>;
  warnings: string[];
};

const SHEET_LABEL: Record<string, string> = {
  processing: "유통가공 세부내역",
  inout: "입출고 세부내역",
  shipments: "출고현황",
  agreements: "협의건",
};

export default function UploadPanel({
  ym,
  confirmed,
}: {
  ym: string;
  confirmed: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/warehouse/settlements/${ym}/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "업로드하지 못했습니다.");
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (confirmed) {
    return (
      <div className="mb-4 px-4 py-3 border border-zinc-200 rounded-xl text-sm text-zinc-500">
        확정된 정산입니다. 원본을 다시 올리려면 아래에서 확정을 해제하세요.
      </div>
    );
  }

  return (
    <div className="mb-4 border border-zinc-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50"
        >
          <Upload size={16} strokeWidth={1.75} />
          {busy ? "읽는 중…" : "정산 엑셀 업로드"}
        </button>
        <p className="text-xs text-zinc-500">
          유통가공 세부내역 / 입출고 세부내역 / 출고현황 / 협의건 시트를 읽습니다.
          같은 시트를 다시 올리면 그 시트만 새 내용으로 바뀝니다.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 text-sm">
          <p className="text-emerald-700">업로드 완료</p>
          <ul className="mt-1 text-xs text-zinc-600 space-y-0.5">
            {Object.keys(SHEET_LABEL).map((k) => (
              <li key={k}>
                {SHEET_LABEL[k]} —{" "}
                {result.found[k] ? (
                  <span className="tabular-nums">{result.counts[k]}행 반영</span>
                ) : (
                  <span className="text-zinc-400">파일에 없음 (그대로 유지)</span>
                )}
              </li>
            ))}
          </ul>
          {result.warnings.length > 0 && (
            <ul className="mt-2 text-xs text-amber-700 space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
