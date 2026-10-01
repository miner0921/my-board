import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { auth } from "@/auth";
import {
  PARTIES,
  SECTIONS,
  isValidYm,
  loadSettlement,
  sourceLabel,
} from "@/lib/settlement";
import SettlementEditor from "./SettlementEditor";
import UploadPanel from "./UploadPanel";

// 정산내역서 편집 화면.
// 자동 수량은 업로드 원본에서 나오고(읽기 전용), 나머지는 여기서 직접 넣는다.

type PageProps = { params: Promise<{ ym: string }> };

const SOURCE_TABS = [
  { type: "shipments", label: "출고현황", key: "shipments" as const },
  { type: "agreements", label: "협의건", key: "agreements" as const },
  { type: "processing", label: "유통가공 세부내역", key: "processing" as const },
  { type: "inout", label: "입출고 세부내역", key: "inout" as const },
];

export default async function SettlementDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "admin") redirect("/warehouse");

  const { ym } = await params;
  if (!isValidYm(ym)) notFound();

  const data = await loadSettlement(ym);
  if (!data) notFound();

  const confirmed = data.month.status === "confirmed";
  const month = Number(ym.slice(5, 7));

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/warehouse/settlements"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
        >
          ← 정산 목록
        </Link>
        <p className="text-sm text-zinc-600">
          <span className="tabular-nums font-medium text-zinc-900">{ym}</span>
          <span className="mx-1.5 text-zinc-300">·</span>
          {month}월 물류대행 내역서
        </p>
      </div>

      {/* 거래처 — 매달 고정값 */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 text-xs text-zinc-600">
        {[PARTIES.supplier, PARTIES.client].map((p) => (
          <div key={p.bizNo} className="border border-zinc-200 rounded-xl p-3">
            <p className="font-medium text-zinc-900 text-sm mb-1">
              {p.title} · {p.name}
            </p>
            <p>등록번호 {p.bizNo} / 대표 {p.ceo}</p>
            <p className="mt-0.5">{p.address}</p>
          </div>
        ))}
      </div>

      <UploadPanel ym={ym} confirmed={confirmed} />

      {/* 업로드 원본 내려받기 — 화면으로 훑을 일은 드물어 다운로드만 둔다 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">원본 내려받기</span>
        {SOURCE_TABS.map((t) => {
          const count = data.uploads[t.key];
          return count > 0 ? (
            <a
              key={t.type}
              href={`/api/warehouse/settlements/${ym}/source/${t.type}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
            >
              <Download size={13} strokeWidth={1.75} />
              {t.label} <span className="tabular-nums text-zinc-500">{count}행</span>
            </a>
          ) : (
            <span
              key={t.type}
              className="px-3 py-1.5 text-xs border border-dashed border-zinc-300 rounded-lg text-zinc-400"
            >
              {t.label} 없음
            </span>
          );
        })}
      </div>

      <SettlementEditor
        ym={ym}
        confirmed={confirmed}
        confirmedBy={data.month.confirmedBy}
        sections={SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
        // 출처 문구는 서버에서 만들어 넘긴다 — 클라이언트가 lib/settlement(=DB)를 물지 않도록.
        lines={data.lines.map((l) => ({
          id: l.id,
          section: l.section,
          name: l.name,
          note: l.note,
          unitPrice: l.unitPrice,
          qty: l.qty,
          auto: l.auto,
          missing: l.missing,
          sourceText: sourceLabel(l.qtySource),
        }))}
      />
    </div>
  );
}
