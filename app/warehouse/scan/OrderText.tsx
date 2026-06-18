// "전체 상품" — 송장 원문을 그대로 보여준다.
//   예: 원문 "쑥1 / 말차1" → 별칭으로 둘 다 (샘플)쑥에 매칭돼도 "쑥1 / 말차1" 그대로.
//
// 표시 소스 = 송장 원문 라인(rawLines). 단, 완료/제외 상태는 품목(item) 단위라
//   각 원문 라인의 item_id 로 live items 에서 끌어온다.
//   · 매핑 품목이 완전 완료면 해당 라인 초록 취소선
//   · 제외(취소)된 품목에 매핑되는 라인은 숨김 (live items 에서 빠져 있음)
//   · 라인별 (x/y) 부분표시는 생략 — 같은 품목을 공유해 라인 단위 진행률이 모호하므로
//
// rawLines 가 없으면(원문 미보존 송장 등) 기존처럼 invoice_items 로 렌더(폴백).

type OrderTextItem = {
  invoice_item_id: number;
  item_id: number;
  display_name: string | null;
  name: string;
  quantity: number;
  scanned_count: number;
  scan_exempt?: boolean;
};

type RawLine = {
  rawName: string;
  qty: number;
  item_id: number | null;
};

export default function OrderText({
  items,
  rawLines = [],
}: {
  items: OrderTextItem[];
  rawLines?: RawLine[];
}) {
  const itemById = new Map<number, OrderTextItem>();
  for (const it of items) itemById.set(it.item_id, it);

  // 원문 라인 모드 — 각 라인 + 매핑 품목 상태. 제외/미매칭 라인은 숨김.
  const rawEntries = rawLines
    .map((line) => ({
      line,
      item: line.item_id !== null ? itemById.get(line.item_id) : undefined,
    }))
    .filter(
      (e): e is { line: RawLine; item: OrderTextItem } => e.item !== undefined
    );

  const useRaw = rawLines.length > 0;
  const entries = useRaw
    ? rawEntries.map((e) => ({
        key: e.line,
        label: e.line.rawName,
        qty: e.line.qty,
        item: e.item,
      }))
    : items.map((it) => ({
        key: it,
        label: it.display_name?.trim() || it.name,
        qty: it.quantity,
        item: it,
      }));

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[11px] text-zinc-500 mb-1.5">전체 상품</p>
      {/* 길면 이 영역 안에서만 스크롤 — 검수 카드 공간을 너무 잡아먹지 않게 */}
      <p className="text-sm leading-relaxed max-h-[26vh] overflow-y-auto">
        {entries.map((e, i) => {
          const item = e.item;
          // 매핑 품목이 완전 완료면 취소선. (부분 진행은 라인 단위로 표시하지 않음)
          const complete =
            item.scanned_count >= item.quantity && item.quantity > 0;
          // 폴백(품목) 모드에서만 부분표시 유지 — 원문 라인 모드는 생략.
          const partial =
            !useRaw && !complete && item.scanned_count > 0;
          return (
            <span key={i}>
              {i > 0 && <span className="text-zinc-300 mx-1">/</span>}
              <span
                className={
                  complete ? "text-green-600 line-through" : "text-zinc-800"
                }
              >
                {e.label}
                {e.qty}
                {item.scan_exempt && (
                  <span className="text-zinc-400 no-underline text-[11px]">
                    {" "}
                    (동봉)
                  </span>
                )}
                {partial && (
                  <span className="text-zinc-400 no-underline">
                    {" "}
                    ({item.scanned_count}/{item.quantity})
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
