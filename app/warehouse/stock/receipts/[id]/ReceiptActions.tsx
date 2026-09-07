"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, ScanLine, Check, Undo2, Trash2 } from "lucide-react";
import Link from "next/link";

// 입고증 상세의 동작 버튼들.
//   인쇄 / 현장 입고 화면 열기 / 입고 완료·다시 열기 / 취소(관리자)
//   ⚠️ 취소는 soft delete 다. 이미 등록된 재고 로트는 되돌리지 않는다(실물은 들어왔으므로).

export default function ReceiptActions({
  receiptId,
  receiptNo,
  status,
  isAdmin,
}: {
  receiptId: number;
  receiptNo: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canceled = status === "canceled";
  const done = status === "received";

  const patch = async (next: "received" | "open") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/stock/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "처리에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("이 입고증을 취소할까요? 이미 등록된 재고는 그대로 남습니다."))
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/stock/receipts/${receiptId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "취소에 실패했습니다.");
        return;
      }
      router.push("/warehouse/stock/receipts");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={() => window.print()} className={btn}>
        <Printer size={16} strokeWidth={1.75} />
        인쇄
      </button>

      {!canceled && (
        <Link href={`/warehouse/stock/receive?no=${receiptNo}`} className={btn}>
          <ScanLine size={16} strokeWidth={1.75} />
          현장 입고
        </Link>
      )}

      {!canceled &&
        (done ? (
          <button
            type="button"
            onClick={() => patch("open")}
            disabled={busy}
            className={btn}
          >
            <Undo2 size={16} strokeWidth={1.75} />
            다시 열기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => patch("received")}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53] disabled:opacity-50"
          >
            <Check size={16} strokeWidth={1.75} />
            입고 완료
          </button>
        ))}

      {isAdmin && !canceled && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
        >
          <Trash2 size={16} strokeWidth={1.75} />
          취소
        </button>
      )}

      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}
