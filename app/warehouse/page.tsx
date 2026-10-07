import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ScanLine, Package, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { query } from "@/lib/db";
import { STORAGE_TYPES } from "@/lib/storage-type";
import PieChart from "./_components/PieChart";

const CUSTOMER = [
  { key: "business", label: "사업자", color: "#18181b" },
  { key: "personal", label: "개인", color: "#f472b6" },
  { key: "unknown", label: "미분류", color: "#d4d4d8" },
];

function kstMonth(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

// 완료된 송장(검수 완료·부분완료·수동완료)의 품목 수량을 완료월(KST) 기준으로 집계.
// 제외 처리된 품목 줄·삭제된 송장은 뺀다.
async function getShipStats(ym: string) {
  const res = await query(
    `SELECT COALESCE(it.storage_type, 'none') AS storage,
            CASE WHEN inv.customer_type = 'business' THEN 'business'
                 WHEN inv.customer_type IN ('individual', 'retail') THEN 'personal'
                 ELSE 'unknown' END AS customer,
            SUM(ii.quantity)::int AS qty
       FROM invoice_items ii
       JOIN invoices inv ON inv.id = ii.invoice_id
       JOIN items it ON it.id = ii.item_id
      WHERE inv.deleted_at IS NULL AND ii.excluded_at IS NULL
        AND inv.status IN ('completed', 'completed_partial', 'manual_completed')
        AND to_char(inv.completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') = $1
      GROUP BY 1, 2`,
    [ym]
  );
  const sum = (f: (r: { storage: string; customer: string }) => boolean) =>
    res.rows.filter(f).reduce((s: number, r: { qty: number }) => s + r.qty, 0);
  return {
    storage: [
      ...STORAGE_TYPES.map((t) => ({ label: t.label, color: t.color, value: sum((r) => r.storage === t.value) })),
      { label: "미지정", color: "#d4d4d8", value: sum((r) => r.storage === "none") },
    ],
    customer: CUSTOMER.map((c) => ({ label: c.label, color: c.color, value: sum((r) => r.customer === c.key) })),
  };
}

export default async function WarehouseDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const { month } = await searchParams;
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : kstMonth();
  const stats = await getShipStats(ym);

  return (
    <div className="max-w-5xl">
      {/* 메인 기능: 출고 검수 (강조 카드) */}
      <Link
        href="/warehouse/scan"
        className="block mb-4 p-6 sm:p-8 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition shadow-sm"
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <ScanLine size={48} strokeWidth={1.5} className="shrink-0 text-zinc-200" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">출고 검수</h2>
            <p className="text-sm text-zinc-300 mt-1">
              송장을 스캔하고 품목을 하나씩 확인합니다
            </p>
          </div>
        </div>
      </Link>

      {/* 보조 기능 2개 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/warehouse/items"
          className="block p-5 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-sm transition"
        >
          <Package size={24} strokeWidth={1.75} className="text-zinc-700 mb-2" />
          <h3 className="font-semibold text-zinc-900">품목 관리</h3>
          <p className="text-xs text-zinc-500 mt-1">
            출고할 품목을 등록하고 관리합니다
          </p>
        </Link>

        <Link
          href="/warehouse/invoices"
          className="block p-5 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-sm transition"
        >
          <FileText size={24} strokeWidth={1.75} className="text-zinc-700 mb-2" />
          <h3 className="font-semibold text-zinc-900">송장 관리</h3>
          <p className="text-xs text-zinc-500 mt-1">
            출고 송장을 만들고 품목을 매핑합니다
          </p>
        </Link>
      </div>

      {/* 월별 출고수량 (완료 송장 기준) */}
      <div className="mt-8 flex items-center gap-2">
        <h2 className="font-semibold text-zinc-900">출고수량</h2>
        <Link href={`/warehouse?month=${shiftMonth(ym, -1)}`} className="p-1 rounded hover:bg-zinc-100" aria-label="이전 달">
          <ChevronLeft size={16} />
        </Link>
        <span className="text-sm text-zinc-700 tabular-nums">{ym}</span>
        <Link href={`/warehouse?month=${shiftMonth(ym, 1)}`} className="p-1 rounded hover:bg-zinc-100" aria-label="다음 달">
          <ChevronRight size={16} />
        </Link>
        <span className="text-xs text-zinc-400">검수 완료된 송장의 품목 수량</span>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <PieChart title="상온 · 냉장 · 냉동" slices={stats.storage} />
        <PieChart title="사업자 · 개인" slices={stats.customer} />
      </div>
    </div>
  );
}
