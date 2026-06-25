// 대시보드 로딩 스켈레톤 (정적, 데이터 접근 없음).
// Next App Router가 warehouse/page.tsx를 <Suspense>로 감싸 이 폴백을 먼저 스트리밍한다.
// 셸(사이드바/헤더)은 layout에서 이미 즉시 렌더되므로 본문 자리만 채운다.
// 실제 대시보드(강조 카드 1 + 보조 카드 2)를 흉내낸다.
// (대시보드는 무거운 쿼리가 없어 스켈레톤이 거의 안 보일 수 있음 — 일관성용.)

// 회색 블록 한 칸
function Bar({ className = "" }: { className?: string }) {
  return <div className={`bg-zinc-200 rounded ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="max-w-5xl animate-pulse" aria-hidden="true">
      <span className="sr-only">대시보드를 불러오는 중…</span>

      {/* 메인 강조 카드 (출고 검수) */}
      <div className="mb-4 p-6 sm:p-8 bg-zinc-100 border border-zinc-200 rounded-xl">
        <div className="flex items-center gap-4 sm:gap-6">
          <Bar className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="space-y-2">
            <Bar className="h-6 w-32" />
            <Bar className="h-3 w-56 max-w-full" />
          </div>
        </div>
      </div>

      {/* 보조 카드 2개 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="p-5 bg-white border border-zinc-200 rounded-xl space-y-2"
          >
            <Bar className="h-6 w-6 rounded mb-2" />
            <Bar className="h-4 w-24" />
            <Bar className="h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
