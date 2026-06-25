// 송장 상세 로딩 스켈레톤 (정적, 데이터 접근 없음).
// Next App Router가 invoices/[id]/page.tsx를 <Suspense>로 감싸 이 폴백을 먼저 스트리밍한다.
// 셸(사이드바/헤더)은 layout에서 이미 즉시 렌더되므로 본문 자리만 채운다.
// 실제 상세 레이아웃(기본정보 카드 + 메타 + 진행률 + 수령인 + 품목 목록)을 흉내낸다.

// 회색 블록 한 칸
function Bar({ className = "" }: { className?: string }) {
  return <div className={`bg-zinc-200 rounded ${className}`} />;
}

// 메타 항목 한 칸 (라벨 + 값)
function Field({ valueClass = "w-32" }: { valueClass?: string }) {
  return (
    <div className="space-y-1.5">
      <Bar className="h-2.5 w-12" />
      <Bar className={`h-4 ${valueClass}`} />
    </div>
  );
}

export default function InvoiceDetailLoading() {
  return (
    <div className="max-w-4xl animate-pulse" aria-hidden="true">
      <span className="sr-only">송장 상세를 불러오는 중…</span>

      {/* 기본 정보 카드 */}
      <article className="border border-zinc-200 rounded-lg p-6 bg-white">
        {/* 상단: 송장번호 + 상태 배지 */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="space-y-2 min-w-0">
            <Bar className="h-2.5 w-16" />
            <Bar className="h-6 w-56 max-w-full" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Bar className="h-7 w-14" />
            <Bar className="h-7 w-14" />
          </div>
        </div>

        {/* 메타 그리드 (주문번호 / 송하인) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pb-4 border-b border-zinc-100">
          <Field />
          <Field />

          {/* 진행률 (전폭) */}
          <div className="sm:col-span-2 space-y-1.5">
            <Bar className="h-2.5 w-12" />
            <div className="flex items-center gap-3">
              <Bar className="h-2 flex-1 rounded-full" />
              <Bar className="h-3 w-20" />
            </div>
          </div>

          <Field valueClass="w-40" />
          <Field valueClass="w-40" />
        </div>

        {/* 수령인 */}
        <div className="pt-4 space-y-3">
          <Bar className="h-2.5 w-12" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
            <Field />
            <Field />
            <Field />
            <div className="sm:col-span-3">
              <Field valueClass="w-3/4" />
            </div>
          </div>
        </div>
      </article>

      {/* 품목 목록 */}
      <section className="mt-6">
        <Bar className="h-5 w-24 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border border-zinc-200 rounded-lg p-3 bg-white"
            >
              {/* 썸네일 */}
              <Bar className="h-14 w-14 shrink-0 rounded-lg" />
              {/* 정보 */}
              <div className="flex-1 min-w-0 space-y-2">
                <Bar className="h-4 w-2/3" />
                <Bar className="h-3 w-24" />
              </div>
              {/* 수량 */}
              <Bar className="h-5 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
