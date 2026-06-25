"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileSpreadsheet,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CircleMinus,
  Loader2,
  Upload,
  ChevronDown,
  ChevronUp,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { type ToastData, summaryToToast } from "../_components/Toast";

// ─────────────────────────────────────────────────────────────
// 업로드 내역(발주서+송장 원본) 목록.
//   - GET /api/warehouse/upload-batches 로 목록(BYTEA 제외, 플래그만).
//   - 완료: 파일 "받기" + 한 줄 집계 + "상세 보기" 토글(등록 송장번호 + 새 품목 이름).
//   - 대기: 빈 쪽에 "○○ 업로드" → stash → 양쪽 차면 자동 등록(commit).
//   상태는 왼쪽 띠 색으로: 노랑=대기, 파랑=처리중, 초록=완료.
//   ★ 표시/문구만 — 서버 호출·검수 로직은 그대로.
// ─────────────────────────────────────────────────────────────

type Batch = {
  id: number;
  status: string;
  order_filename: string | null;
  has_order_file: boolean;
  order_uploaded_at: string | null;
  order_uploaded_by_name: string | null;
  invoice_filename: string | null;
  has_invoice_file: boolean;
  invoice_uploaded_at: string | null;
  invoice_uploaded_by_name: string | null;
  inserted_items: number;
  inserted_invoices: number;
  skipped_invoices: number;
  created_at: string;
  deleted_at: string | null;
  deleted_by_name: string | null;
  scanned_invoice_count: number;
  files: { id: number; kind: string; filename: string | null }[];
};

type BatchDetail = {
  insertedItems: number;
  insertedInvoices: number;
  skippedInvoices: number;
  itemNames: string[];
  invoiceNos: string[];
  matchedCount: number;
  invoiceOnlyCount: number;
  unmatchedOrderCount: number;
};

// 항상 한국시간으로 표시 (환경 TZ 무관).
function formatKst(date: string | null): string {
  if (!date) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

export default function BatchList({
  reloadSignal,
  onToast,
  onChanged,
}: {
  reloadSignal: number;
  onToast: (t: ToastData) => void;
  onChanged: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false); // 삭제된 등록건 보기 토글
  // 방금 등록/승격된 내역 강조 (타이머 없이 state로만 — 모달 닫으면 unmount되어 초기화)
  const [justDoneId, setJustDoneId] = useState<number | null>(null);
  // 상세 보기
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, BatchDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/warehouse/upload-batches${showDeleted ? "?deleted=1" : ""}`
      );
      const data = await res.json();
      if (res.ok) setBatches(data.batches ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [showDeleted]);

  // 마운트 + 부모 신호(업로드/대기저장 성공) + 보기 전환 때마다 새로고침
  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  // 등록건 통째 삭제 (스캔된 게 있으면 경고)
  async function handleDeleteBatch(b: Batch) {
    const msg =
      b.scanned_invoice_count > 0
        ? `이 등록건에 ${b.scanned_invoice_count}건이 이미 스캔(검수)되었습니다.\n` +
          `삭제해도 검수 기록은 보존됩니다. 삭제할까요?`
        : `이 등록건을 삭제할까요? (복구할 수 있습니다)`;
    if (!confirm(msg)) return;
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/warehouse/upload-batches/${b.id}/delete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "삭제에 실패했습니다.");
        return;
      }
      onToast({
        tone: "blue",
        title: "등록건을 삭제했습니다.",
        desc: `송장 ${data.affected}건 삭제 · 복구할 수 있습니다`,
      });
      onChanged();
      await load();
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // 삭제된 등록건 복구
  async function handleRestoreBatch(b: Batch) {
    if (!confirm("이 등록건을 복구할까요?")) return;
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/warehouse/upload-batches/${b.id}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "복구에 실패했습니다.");
        return;
      }
      onToast({
        tone: "green",
        title: "등록건을 복구했습니다.",
        desc: `송장 ${data.affected}건 복구`,
      });
      onChanged();
      await load();
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // 상세 보기 토글 (펼칠 때 lazy fetch)
  async function toggleDetail(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!details[id]) {
      setDetailLoadingId(id);
      try {
        const res = await fetch(`/api/warehouse/upload-batches/${id}/detail`);
        const data = await res.json();
        if (res.ok) setDetails((d) => ({ ...d, [id]: data }));
      } catch (e) {
        console.error(e);
      } finally {
        setDetailLoadingId(null);
      }
    }
  }

  // 대기 내역의 빈 쪽 채우기 → 양쪽 차면 바로 등록
  async function handleFill(
    batch: Batch,
    kind: "order" | "invoice",
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 선택 가능하게
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      alert("엑셀(.xlsx) 파일만 올릴 수 있습니다.");
      return;
    }
    setBusyId(batch.id);
    try {
      // 1) 빈 쪽 채우기(stash, batchId 지정)
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      fd.append("batchId", String(batch.id));
      const res = await fetch("/api/warehouse/upload-batches", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "추가에 실패했습니다.");
        await load();
        return;
      }

      // 2) 양쪽 다 찼으면 등록(commit)
      if (data.readyToCommit) {
        const cres = await fetch(
          `/api/warehouse/upload-batches/${batch.id}/commit`,
          { method: "POST" }
        );
        const cdata = await cres.json();
        if (!cres.ok) {
          alert(cdata.error || "등록에 실패했습니다.");
          await load();
          return;
        }
        setJustDoneId(batch.id); // 방금 완료 강조(지속)
        onToast(summaryToToast(cdata.summary)); // 순간 알림
        onChanged(); // 송장 목록 갱신
      }
      await load();
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 pt-5 border-t border-zinc-100">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-zinc-900">
          {showDeleted ? "삭제된 등록건" : "업로드 내역"}
        </h3>
        <button
          type="button"
          onClick={() => setShowDeleted((v) => !v)}
          className="text-xs text-zinc-500 underline hover:text-zinc-900"
        >
          {showDeleted ? "← 활성 등록건" : "삭제된 등록건 보기"}
        </button>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        {showDeleted
          ? "삭제된 등록건 — 복구할 수 있습니다 (검수기록 보존됨)."
          : "발주서와 송장을 모두 올리면 등록됩니다. 한쪽만 올리면 대기 상태로 저장됩니다."}
      </p>

      {loading && batches.length === 0 ? (
        <p className="text-xs text-zinc-400">불러오는 중...</p>
      ) : batches.length === 0 ? (
        <p className="text-xs text-zinc-400">아직 업로드 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-auto">
          {batches.map((b) => {
            const isWaiting = b.status === "waiting";
            const busy = busyId === b.id;
            const done = justDoneId === b.id;
            const open = openId === b.id;
            const isDeleted = !!b.deleted_at; // 삭제된 등록건 보기에서만 true
            const missingKind: "order" | "invoice" | null = isWaiting
              ? b.has_order_file
                ? "invoice"
                : "order"
              : null;
            const missingLabel = missingKind === "order" ? "발주서" : "송장";

            // 완료 세부 상태(집계 기준): 초록=정상 / 노랑=일부중복 / 회색=0건(전부중복)
            const compTone: "green" | "amber" | "gray" = isWaiting
              ? "green" // 미사용(대기 행은 아래에서 따로 렌더)
              : b.inserted_invoices === 0
                ? "gray"
                : b.skipped_invoices >= 1
                  ? "amber"
                  : "green";

            // 왼쪽 띠 색: 삭제됨(회색) > 파랑(처리중) > 노랑(대기) > 완료 세부색
            const stripe = isDeleted
              ? "border-l-zinc-300"
              : busy
                ? "border-l-blue-500"
                : isWaiting
                  ? "border-l-amber-400"
                  : compTone === "gray"
                    ? "border-l-zinc-400"
                    : compTone === "amber"
                      ? "border-l-amber-400"
                      : "border-l-green-500";
            // 방금 처리분만 테두리 살짝 굵게 — ring 색도 행 상태색 따름(0건이 초록으로 안 보이게)
            const ring = done
              ? compTone === "gray"
                ? "border border-zinc-400 ring-1 ring-zinc-200"
                : compTone === "amber"
                  ? "border border-amber-400 ring-1 ring-amber-200"
                  : "border border-green-400 ring-1 ring-green-200"
              : "border border-zinc-100";

            return (
              <li
                key={b.id}
                className={`rounded-lg border-l-[3px] ${stripe} ${ring} px-3 py-2.5 text-xs`}
              >
                {/* 상단: 상태 한 줄 + 시각 */}
                <div className="flex items-center gap-2 mb-2">
                  {busy ? (
                    <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                      <Loader2
                        size={12}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      처리 중...
                    </span>
                  ) : isWaiting ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                      <Clock size={12} strokeWidth={2} />
                      {missingLabel} 미등록
                    </span>
                  ) : compTone === "gray" ? (
                    <span className="inline-flex items-center gap-1.5 text-zinc-500 font-medium">
                      <CircleMinus size={12} strokeWidth={2} />
                      등록된 송장 없음 · 중복 {b.skipped_invoices}건 전체 제외
                    </span>
                  ) : compTone === "amber" ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                      <AlertTriangle size={12} strokeWidth={2} />
                      등록 완료 · 송장 {b.inserted_invoices}건 · 중복{" "}
                      {b.skipped_invoices}건 제외
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
                      <CheckCircle2 size={12} strokeWidth={2} />
                      등록 완료 · 송장 {b.inserted_invoices}건 · 새 품목{" "}
                      {b.inserted_items}개
                    </span>
                  )}
                  <span className="text-zinc-400 ml-auto">
                    {formatKst(b.created_at)}
                  </span>
                </div>

                {/* 처리중: 가는 진행 바 */}
                {busy && (
                  <div className="mb-2 h-0.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400" />
                  </div>
                )}

                {/* 발주서 / 송장 파일 목록(각 N개) */}
                {(() => {
                  const orderFiles = b.files.filter((f) => f.kind === "order");
                  const invoiceFiles = b.files.filter(
                    (f) => f.kind === "invoice"
                  );
                  // 발주서·송장 그룹이 둘 다 파일이 있을 때만 사이에 희미한 구분선
                  const showDivider =
                    orderFiles.length > 0 && invoiceFiles.length > 0;
                  return (
                    <div className="space-y-1">
                      <KindFiles
                        label="발주서"
                        files={orderFiles}
                        canFill={isWaiting && !isDeleted && orderFiles.length === 0}
                        busy={busy}
                        onFill={(e) => handleFill(b, "order", e)}
                        promptText="발주서를 업로드하세요"
                        uploadLabel="발주서 업로드"
                      />
                      {showDivider && (
                        <div className="border-t border-zinc-100" />
                      )}
                      <KindFiles
                        label="송장"
                        files={invoiceFiles}
                        canFill={
                          isWaiting && !isDeleted && invoiceFiles.length === 0
                        }
                        busy={busy}
                        onFill={(e) => handleFill(b, "invoice", e)}
                        promptText="송장을 업로드하세요"
                        uploadLabel="송장 업로드"
                      />
                    </div>
                  );
                })()}

                {/* 완료: 상세 보기 토글 (삭제 보기에서도 내역 확인 가능) */}
                {!isWaiting && !busy && (
                  <div className="mt-2">
                    <button
                      onClick={() => toggleDetail(b.id)}
                      className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900"
                    >
                      {open ? (
                        <ChevronUp size={13} strokeWidth={2} />
                      ) : (
                        <ChevronDown size={13} strokeWidth={2} />
                      )}
                      상세 보기
                    </button>

                    {open && (
                      <div className="mt-2 rounded-md bg-zinc-50 border border-zinc-100 p-2.5 space-y-2">
                        {detailLoadingId === b.id && !details[b.id] ? (
                          <p className="text-zinc-400">불러오는 중...</p>
                        ) : details[b.id] ? (
                          <BatchDetailView detail={details[b.id]} />
                        ) : (
                          <p className="text-zinc-400">
                            상세를 불러오지 못했습니다.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 푸터: 활성=삭제 / 삭제됨=삭제정보+복구 */}
                {!busy && (
                  <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center gap-2">
                    {isDeleted ? (
                      <>
                        <span className="text-zinc-400">
                          삭제: {formatKst(b.deleted_at)} ·{" "}
                          {b.deleted_by_name ?? "(알 수 없음)"}
                        </span>
                        <button
                          onClick={() => handleRestoreBatch(b)}
                          className="ml-auto inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                        >
                          <RotateCcw size={12} strokeWidth={2} />
                          복구
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDeleteBatch(b)}
                        className="ml-auto inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={12} strokeWidth={2} />
                        등록건 삭제
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// 상세 내용: 집계 + 등록 송장번호 + 새 품목 이름
function BatchDetailView({ detail }: { detail: BatchDetail }) {
  return (
    <>
      <div className="text-zinc-600">
        등록 송장 {detail.insertedInvoices}건 · 새 품목 {detail.insertedItems}개
        {detail.skippedInvoices > 0 && (
          <span className="text-amber-600">
            {" "}
            · 건너뜀 {detail.skippedInvoices}건
          </span>
        )}
      </div>

      <div className="text-zinc-500">
        매칭 {detail.matchedCount} · 송장만 {detail.invoiceOnlyCount} · 발주서만{" "}
        {detail.unmatchedOrderCount}
      </div>

      <div>
        <p className="text-zinc-500 mb-1">등록된 송장번호</p>
        {detail.invoiceNos.length === 0 ? (
          <p className="text-zinc-400">없음</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {detail.invoiceNos.map((no) => (
              <span
                key={no}
                className="font-mono text-[11px] bg-white border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-700"
              >
                {no}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-zinc-500 mb-1">새로 추가된 품목</p>
        {detail.itemNames.length === 0 ? (
          <p className="text-zinc-400">없음</p>
        ) : (
          <ul className="text-zinc-700 space-y-0.5">
            {detail.itemNames.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// 한 종류(발주서/송장)의 파일 목록(N개):
//  - 파일들 → 각 줄 "파일명 + 받기"(파일 id 기준 다운로드). 라벨은 첫 줄만.
//  - 대기 + 빈 측 → 옅은 노란 배경 + 안내문 + "○○ 업로드" 버튼.
//  - 그 외 빈 측 → "미등록".
function KindFiles({
  label,
  files,
  canFill,
  busy,
  onFill,
  promptText,
  uploadLabel,
}: {
  label: string;
  files: { id: number; filename: string | null }[];
  canFill: boolean;
  busy: boolean;
  onFill: (e: React.ChangeEvent<HTMLInputElement>) => void;
  promptText: string;
  uploadLabel: string;
}) {
  // 빈 측 + 대기 → 업로드 안내
  if (files.length === 0 && canFill) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5">
        <FileSpreadsheet
          size={14}
          strokeWidth={1.75}
          className="text-amber-500 shrink-0"
        />
        <span className="text-zinc-500 shrink-0 w-9">{label}</span>
        <span className="text-amber-700">{promptText}</span>
        <label
          className={`ml-auto shrink-0 inline-flex items-center gap-1 cursor-pointer rounded border border-amber-400 px-2.5 py-1 font-medium text-amber-700 hover:bg-amber-100 ${
            busy ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <Upload size={12} strokeWidth={2} />
          {uploadLabel}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={onFill}
            disabled={busy}
          />
        </label>
      </div>
    );
  }

  // 빈 측 + 대기 아님 → 미등록
  if (files.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <FileSpreadsheet
          size={14}
          strokeWidth={1.75}
          className="text-zinc-400 shrink-0"
        />
        <span className="text-zinc-400 shrink-0 w-9">{label}</span>
        <span className="text-zinc-300">미등록</span>
      </div>
    );
  }

  // 파일 목록
  return (
    <div>
      {files.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2 px-2 py-1.5">
          {/* 라벨 칸(첫 줄만 텍스트, 아래 줄은 빈 칸으로 정렬 유지) */}
          <span className="text-zinc-400 shrink-0 w-9">
            {i === 0 ? label : ""}
          </span>
          {/* 아이콘 + 파일명을 한 덩어리로 */}
          <span className="flex items-center gap-1 min-w-0 text-zinc-700">
            <FileSpreadsheet
              size={14}
              strokeWidth={1.75}
              className="text-zinc-400 shrink-0"
            />
            <span className="truncate">{f.filename ?? "(파일명 없음)"}</span>
          </span>
          <a
            href={`/api/warehouse/upload-files/${f.id}`}
            className="ml-auto shrink-0 inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
          >
            <Download size={12} strokeWidth={2} />
            받기
          </a>
        </div>
      ))}
    </div>
  );
}
