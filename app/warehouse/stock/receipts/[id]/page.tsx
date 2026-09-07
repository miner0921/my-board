import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadReceipt } from "@/lib/stock-receipt";
import { formatDateTime } from "../../../invoices/_list";
import ReceiptBarcode from "./ReceiptBarcode";
import ReceiptActions from "./ReceiptActions";
import { receiptStatusLabel } from "../_status";

// 입고증 상세 = 그대로 인쇄해서 현장에 들고 가는 서류.
//   상단 바코드를 현장에서 스캔하면 아래 예정 품목이 입력 화면에 뜬다.
//   인쇄 시에는 버튼/네비게이션이 빠지도록 print:hidden 을 쓴다.

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const { id } = await params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId) || receiptId <= 0) notFound();

  const full = await loadReceipt({ id: receiptId });
  if (!full) notFound();
  const { receipt, items } = full;

  const plannedTotal = items.reduce((s, r) => s + r.planned_quantity, 0);
  const receivedTotal = items.reduce((s, r) => s + r.received_quantity, 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href="/warehouse/stock/receipts"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
        >
          ← 입고증 목록
        </Link>
        <ReceiptActions
          receiptId={receipt.id}
          receiptNo={receipt.receipt_no}
          status={receipt.status}
          isAdmin={isAdmin}
        />
      </div>

      {/* 인쇄 영역 */}
      <div className="border border-zinc-200 rounded-xl bg-white p-6 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">입고증</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {receipt.title ?? "(제목 없음)"}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              작성 {formatDateTime(String(receipt.created_at))} ·{" "}
              {receipt.author_nickname ?? "—"} ·{" "}
              {receiptStatusLabel(receipt.status)}
            </p>
          </div>
          <div className="text-center">
            <ReceiptBarcode value={receipt.receipt_no} />
          </div>
        </div>

        <table className="w-full text-sm mt-4">
          <thead className="text-zinc-500 text-xs">
            <tr className="border-b border-zinc-200">
              <th className="text-left font-medium px-2 py-2">품목</th>
              <th className="text-left font-medium px-2 py-2 whitespace-nowrap">
                소비기한
              </th>
              <th className="text-right font-medium px-2 py-2 whitespace-nowrap">
                예정
              </th>
              <th className="text-right font-medium px-2 py-2 whitespace-nowrap">
                입고
              </th>
              {/* 현장에서 손으로 적는 칸 */}
              <th className="text-left font-medium px-2 py-2 w-40 print:w-56">
                소비기한 / 수량
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2.5">
                  <span className="text-zinc-900">{r.name}</span>
                  {r.expiry_managed && (
                    <span className="ml-2 text-xs text-violet-700">
                      소비기한 필수
                    </span>
                  )}
                  <span className="block text-xs text-zinc-400">
                    {r.barcode ?? "바코드 없음"}
                  </span>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap tabular-nums text-zinc-600">
                  {r.expiry_date ?? "—"}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-zinc-600">
                  {r.planned_quantity}
                </td>
                <td
                  className={`px-2 py-2.5 text-right tabular-nums font-medium ${
                    r.received_quantity > 0 ? "text-green-700" : "text-zinc-300"
                  }`}
                >
                  {r.received_quantity}
                </td>
                <td className="px-2 py-2.5">
                  <span className="block h-6 border-b border-dashed border-zinc-300" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 text-sm">
              <td className="px-2 py-2 text-zinc-500" colSpan={2}>
                합계
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-600">
                {plannedTotal}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-zinc-900">
                {receivedTotal}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <p className="mt-4 text-xs text-zinc-400">
          현장에서 위 바코드를 스캔하면 이 품목들이 입력 화면에 뜹니다.
        </p>
      </div>
    </div>
  );
}
