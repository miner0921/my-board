import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ScanLine, Package, FileText } from "lucide-react";

export default async function WarehouseDashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

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
    </div>
  );
}
