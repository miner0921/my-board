// 발주서 원문 텍스트 — 송장 품목들을 한 덩어리 문자열로 보여준다.
//   (예: "(증정)망고 / 홍백향차 ×2 / 흑임자")
// 스캔 완료된 품목은 초록 + 취소선, 미완료는 그대로. 작업자가 쭉 읽으며 작업.
// 품목 카드 그리드와 "같은 invoice_items 한 소스"로 렌더한다(중복 없음).

type OrderTextItem = {
  invoice_item_id: number;
  display_name: string | null;
  name: string;
  quantity: number;
  scanned_count: number;
  scan_exempt?: boolean;
};

export default function OrderText({ items }: { items: OrderTextItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[11px] text-zinc-500 mb-1.5">전체 상품</p>
      <p className="text-sm leading-relaxed">
        {items.map((it, i) => {
          const label = it.display_name?.trim() || it.name;
          // 스캔 불필요 품목: 취소선/카운트 없이 회색 안내(챙기되 안 찍음)
          if (it.scan_exempt) {
            return (
              <span key={it.invoice_item_id}>
                {i > 0 && <span className="text-zinc-300 mx-1">/</span>}
                <span className="text-zinc-400">
                  {label}
                  <span className="text-[11px]"> (스캔 불필요)</span>
                </span>
              </span>
            );
          }
          const complete = it.scanned_count >= it.quantity && it.quantity > 0;
          const partial = !complete && it.scanned_count > 0;
          return (
            <span key={it.invoice_item_id}>
              {i > 0 && <span className="text-zinc-300 mx-1">/</span>}
              <span
                className={
                  complete ? "text-green-600 line-through" : "text-zinc-800"
                }
              >
                {label}
                {it.quantity}
                {partial && (
                  <span className="text-zinc-400 no-underline">
                    {" "}
                    ({it.scanned_count}/{it.quantity})
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </p>
    </div>
  );
}
