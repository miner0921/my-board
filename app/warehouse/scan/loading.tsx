// 출고 스캔 로딩 스켈레톤 (정적, 데이터 접근 없음).
// Next App Router가 scan/page.tsx를 <Suspense>로 감싸 이 폴백을 먼저 스트리밍한다.
// scan 세그먼트에 전용 loading이 없으면 상위(대시보드) 스켈레톤이 상속돼
// 엉뚱한 카드 모양이 떴다 — 그걸 막기 위한 스캔 전용 폴백.
//
// 첫 화면은 "송장 바코드를 스캔하세요" 입력란 하나뿐이므로(제목/메뉴는
// layout이라 이미 떠 있음), 여기서는 그 입력란 자리만 회색 블록으로 흉내낸다.
// 송장정보·진행률·품목카드는 데이터가 와야 생기는 영역이라 넣지 않는다.

// 회색 블록 한 칸
function Bar({ className = "" }: { className?: string }) {
  return <div className={`bg-zinc-200 rounded ${className}`} />;
}

export default function ScanLoading() {
  return (
    <div className="max-w-5xl animate-pulse" aria-hidden="true">
      <span className="sr-only">출고 스캔 화면을 불러오는 중…</span>

      {/* 바코드 입력란 카드 — 실제 입력 박스와 같은 테두리/라운드/패딩 */}
      <div className="sticky top-0 z-20 bg-white pt-1 pb-3">
        <div className="bg-white border-2 border-zinc-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 sm:p-4">
            {/* 큰 입력란 자리 (실제 input과 같은 높이·폭·라운드) */}
            <Bar className="h-14 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
