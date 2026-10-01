import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { formatMoney, loadSettlement } from "@/lib/settlement";
import NewMonthButton from "./NewMonthButton";

// 정산 관리 — 월 단위 물류대행 정산내역서 목록.
// 금액이 걸린 화면이라 관리자만 들어온다(미들웨어 + 여기 + API 삼중).
// 당월 계는 목록에서도 loadSettlement 로 계산한다 — 집계 로직을 두 벌 두지 않기 위해서다.
// 대신 한 번에 한 해(최대 12개월)만 편다.

type PageProps = {
  searchParams: Promise<{ year?: string }>;
};

export default async function SettlementsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "admin") redirect("/warehouse");

  const sp = await searchParams;

  const yearsRes = await query(
    `SELECT DISTINCT LEFT(ym, 4) AS y FROM settlement_months ORDER BY y DESC`
  );
  const years: string[] = yearsRes.rows.map((r) => r.y);
  const year = years.includes(sp.year ?? "")
    ? (sp.year as string)
    : years[0] ?? String(new Date().getFullYear());

  const ymRes = await query(
    `SELECT ym FROM settlement_months WHERE ym LIKE $1 ORDER BY ym DESC`,
    [`${year}-%`]
  );
  const months = await Promise.all(
    ymRes.rows.map((r) => loadSettlement(r.ym as string))
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex justify-end">
        <NewMonthButton />
      </div>

      {years.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {years.map((y) => (
            <Link
              key={y}
              href={`/warehouse/settlements?year=${y}`}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                y === year
                  ? "bg-zinc-900 border-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {y}년
            </Link>
          ))}
        </div>
      )}

      {months.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-xl">
          아직 만든 정산이 없습니다. &quot;정산 월 추가&quot;로 시작하세요.
        </div>
      ) : (
        <div className="space-y-2">
          {months.map((m) => {
            if (!m) return null;
            const confirmed = m.month.status === "confirmed";
            const uploaded =
              m.uploads.shipments + m.uploads.agreements + m.uploads.processing + m.uploads.inout;
            return (
              <Link
                key={m.month.ym}
                href={`/warehouse/settlements/${m.month.ym}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition"
              >
                <span className="text-base font-medium tabular-nums">{m.month.ym}</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    confirmed
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {confirmed ? "확정" : "작성중"}
                </span>
                {uploaded === 0 && (
                  <span className="text-xs text-zinc-400">원본 미업로드</span>
                )}
                <span className="ml-auto text-base font-medium tabular-nums">
                  {formatMoney(m.total)}원
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
