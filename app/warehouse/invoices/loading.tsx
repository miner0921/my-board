// 송장 목록 로딩 스켈레톤 (정적, 데이터 접근 없음).
// Next App Router가 invoices/page.tsx를 <Suspense>로 감싸 이 폴백을 먼저 스트리밍한다.
// 셸(사이드바/헤더)은 layout에서 이미 즉시 렌더되므로 본문 자리만 채운다.
// 실제 목록 레이아웃(액션바·탭·검색·표 행)을 회색 블록으로 흉내내 "여기 들어올 자리"를 보여준다.

// 회색 블록 한 칸
function Bar({ className = "" }: { className?: string }) {
  return <div className={`bg-zinc-200 rounded ${className}`} />;
}

export default function InvoicesLoading() {
  return (
    <div className="max-w-6xl animate-pulse" aria-hidden="true">
      <span className="sr-only">송장 목록을 불러오는 중…</span>

      {/* 액션 바: 설명 문구(좌) + 버튼들(우) */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Bar className="h-4 w-72 max-w-full" />
        <div className="flex items-center gap-2">
          <Bar className="h-9 w-28" />
          <Bar className="h-9 w-44" />
        </div>
      </div>

      {/* 상태 탭 */}
      <div className="mb-4 flex gap-2 border-b border-zinc-200">
        <Bar className="h-6 w-12 mb-2" />
        <Bar className="h-6 w-12 mb-2" />
      </div>

      {/* 검색 + 필터 줄 */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Bar className="h-10 flex-1 min-w-[200px]" />
        <Bar className="h-10 w-28" />
        <Bar className="h-10 w-32" />
        <Bar className="h-10 w-32" />
        <Bar className="h-10 w-16" />
      </div>

      {/* 그룹 헤더 바 */}
      <Bar className="h-10 w-full mb-2" />

      {/* 표: 컬럼 헤더 + 행들 */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        {/* 컬럼 헤더 (sm 이상) */}
        <div className="hidden sm:flex items-center gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
          <div className="flex-1 grid grid-cols-12 gap-3">
            <Bar className="col-span-3 h-3" />
            <Bar className="col-span-2 h-3" />
            <Bar className="col-span-2 h-3" />
            <Bar className="col-span-1 h-3" />
            <Bar className="col-span-1 h-3" />
            <Bar className="col-span-1 h-3" />
            <Bar className="col-span-2 h-3" />
          </div>
        </div>

        {/* 행 8개 */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-4 border-b border-zinc-100 last:border-b-0"
          >
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-12 gap-3">
              <Bar className="col-span-1 sm:col-span-3 h-4" />
              <Bar className="col-span-1 sm:col-span-2 h-4" />
              <Bar className="col-span-1 sm:col-span-2 h-4" />
              <Bar className="col-span-1 sm:col-span-1 h-4" />
              <Bar className="col-span-1 sm:col-span-1 h-4" />
              <Bar className="col-span-1 sm:col-span-1 h-4" />
              <Bar className="col-span-1 sm:col-span-2 h-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
