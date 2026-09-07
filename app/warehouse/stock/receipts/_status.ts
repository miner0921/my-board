// 입고증 상태 라벨/배지. 목록·상세·현장 입고 화면이 같이 쓴다.
// (서버 모듈을 import 하지 않는다 — 클라이언트 컴포넌트에서도 안전해야 하므로)
//
// 상태는 현장 입고 등록이 끝날 때 서버가 자동으로 정한다:
//   예정 수량을 전부 채움 → received / 일부만 채움 → partial / 아직 0 → open

export const RECEIPT_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "입고 대기", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  partial: { label: "부분 입고", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  received: {
    label: "입고 완료",
    cls: "bg-green-50 text-green-800 border-green-200",
  },
  canceled: { label: "취소됨", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export const receiptStatusLabel = (s: string) => RECEIPT_STATUS[s]?.label ?? s;

// 목록 탭 — "입고 대기" 탭에는 부분 입고도 같이 남는다.
export const RECEIPT_TABS: Record<string, { label: string; statuses: string[] }> =
  {
    open: { label: "입고 대기", statuses: ["open", "partial"] },
    received: { label: "입고 완료", statuses: ["received"] },
  };
