import Link from "next/link";

// 품목 목록 전용 번호 페이지네이션 (서버 컴포넌트 — Link만 렌더).
//   · baseParams(현재 필터/정렬/검색 조건, page 제외)를 유지한 채 page만 바꾼다.
//   · 페이지가 많으면 현재 페이지 주변 + 처음/끝만 노출(… 생략).
//   · 다른 화면(송장 keyset)과 무관 — 이 화면에서만 사용.
export default function Pagination({
  currentPage,
  totalPages,
  total,
  baseParams,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  baseParams: Record<string, string>;
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams(baseParams);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/warehouse/items${s ? `?${s}` : ""}`;
  };

  // 노출할 페이지 번호 집합: 1, 끝, 현재±1
  const nums = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...nums].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  // 연속되지 않은 구간에 … 삽입
  const withGaps: Array<number | "gap"> = [];
  let prev = 0;
  for (const p of pages) {
    if (prev && p - prev > 1) withGaps.push("gap");
    withGaps.push(p);
    prev = p;
  }

  const numBtn =
    "inline-flex items-center justify-center min-w-[36px] h-9 px-2 rounded-lg text-sm border transition";
  const arrow =
    "inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm border transition";

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <p className="text-xs text-zinc-400">전체 {total}건</p>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="페이지네이션">
          {/* 이전 */}
          {currentPage > 1 ? (
            <Link href={href(currentPage - 1)} className={`${arrow} border-zinc-300 text-zinc-700 hover:bg-zinc-50`} aria-label="이전 페이지">
              ‹
            </Link>
          ) : (
            <span className={`${arrow} border-zinc-200 text-zinc-300 cursor-default`} aria-hidden>
              ‹
            </span>
          )}

          {withGaps.map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-zinc-400 select-none">
                …
              </span>
            ) : p === currentPage ? (
              <span key={p} className={`${numBtn} border-[#042C53] bg-[#042C53] text-white font-medium`} aria-current="page">
                {p}
              </span>
            ) : (
              <Link key={p} href={href(p)} className={`${numBtn} border-zinc-300 text-zinc-700 hover:bg-zinc-50`}>
                {p}
              </Link>
            )
          )}

          {/* 다음 */}
          {currentPage < totalPages ? (
            <Link href={href(currentPage + 1)} className={`${arrow} border-zinc-300 text-zinc-700 hover:bg-zinc-50`} aria-label="다음 페이지">
              ›
            </Link>
          ) : (
            <span className={`${arrow} border-zinc-200 text-zinc-300 cursor-default`} aria-hidden>
              ›
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
