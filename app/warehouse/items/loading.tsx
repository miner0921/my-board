// 품목 목록 로딩 스켈레톤 (정적, 데이터 접근 없음).
// Next App Router가 items/page.tsx를 <Suspense>로 감싸 이 폴백을 먼저 스트리밍한다.
// 셸(사이드바/헤더)은 layout에서 이미 즉시 렌더되므로 본문 자리만 채운다.
// 실제 카드 그리드(액션바·검색·카드들)를 회색 블록으로 흉내낸다.

// 회색 블록 한 칸
function Bar({ className = "" }: { className?: string }) {
  return <div className={`bg-zinc-200 rounded ${className}`} />;
}

export default function ItemsLoading() {
  return (
    <div className="max-w-6xl animate-pulse" aria-hidden="true">
      <span className="sr-only">품목 목록을 불러오는 중…</span>

      {/* 액션 바: 설명 문구(좌) + 버튼들(우) */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Bar className="h-4 w-64 max-w-full" />
        <div className="flex items-center gap-2">
          <Bar className="h-9 w-28" />
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-24" />
        </div>
      </div>

      {/* 검색 + 필터 줄 */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Bar className="h-10 flex-1 min-w-[200px]" />
        <Bar className="h-10 w-28" />
        <Bar className="h-10 w-28" />
        <Bar className="h-10 w-32" />
        <Bar className="h-10 w-28" />
        <Bar className="h-10 w-16" />
      </div>

      {/* 카드 그리드 — 실제와 동일한 컬럼 수/간격 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="border border-zinc-200 rounded-lg overflow-hidden bg-white flex flex-col"
          >
            {/* 썸네일 자리 (정사각) */}
            <div className="aspect-square bg-zinc-100 border-b border-zinc-100" />

            {/* 정보 자리 */}
            <div className="p-2 flex-1 flex flex-col gap-1.5">
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-3/4" />
              <Bar className="h-3 w-16 mt-0.5" />
              <Bar className="h-3 w-2/3 mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
