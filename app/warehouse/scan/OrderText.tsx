// "전체 상품" — 송장 원문 대비 현재 상태(추가/취소)를 한 줄 슬래시 양식으로 보여준다.
//   예: 원문 "쑥1 / 말차1" → 별칭으로 둘 다 (샘플)쑥에 매칭돼도 "쑥1 / 말차1" 그대로.
//
// 표시 소스 = 송장 원문 라인(rawLines)이 뼈대. 완료/취소 상태는 품목(item) 단위라
//   각 원문 라인의 item_id 로 live items 에서 끌어온다(items 엔 취소품목도 포함).
//   · 매핑 품목이 완전 완료면 해당 라인 초록 취소선 (기존)
//   · 취소(excluded)된 품목 라인 → 회색/빨강 + "(취소)", 취소선 금지(챙김과 헷갈림 방지)
//   · 원문에 없던 현장 추가분(is_added_on_scan) → 원문 라인 뒤에 파랑 + "(추가)"
//   · 매칭 안 된 원문 라인(item_id null)도 숨기지 않고 기본색으로 그대로 표시(빠뜨림 방지)
//   · 라인별 (x/y) 부분표시는 생략 — 같은 품목을 공유해 라인 단위 진행률이 모호하므로
//
// rawLines 가 없으면(원문 미보존 송장 등) 기존처럼 invoice_items 로 렌더(폴백).
//   폴백도 취소=(취소)/추가=(추가) 동일 규칙으로 표시한다.

type OrderTextItem = {
  invoice_item_id: number;
  item_id: number;
  display_name: string | null;
  name: string;
  quantity: number;
  scanned_count: number;
  scan_exempt?: boolean;
  inspection_exempt?: boolean;
  is_added_on_scan?: boolean;
  excluded?: boolean;
};

type RawLine = {
  rawName: string;
  qty: number;
  item_id: number | null;
};

type Entry = {
  label: string;
  qty: number;
  item: OrderTextItem | undefined;
  isAdded: boolean;
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

  const useRaw = rawLines.length > 0;

  let entries: Entry[];
  if (useRaw) {
    // 원문 라인 뼈대 — 매칭/취소/미매칭 모두 숨기지 않고 그대로 둔다.
    const rawList: Entry[] = rawLines.map((line) => ({
      label: line.rawName,
      qty: line.qty,
      item: line.item_id !== null ? itemById.get(line.item_id) : undefined,
      isAdded: false,
    }));
    // 원문에 없던 현장 추가분을 뒤에 붙인다(원문 라인이 가리키는 item 은 제외 = 중복 방지).
    const rawItemIds = new Set(
      rawLines.map((l) => l.item_id).filter((id): id is number => id !== null)
    );
    const addedList: Entry[] = items
      .filter((it) => it.is_added_on_scan && !rawItemIds.has(it.item_id))
      .map((it) => ({
        label: it.display_name?.trim() || it.name,
        qty: it.quantity,
        item: it,
        isAdded: true,
      }));
    entries = [...rawList, ...addedList];
  } else {
    // 폴백 — 원문이 없으면 품목 목록 그대로(취소품목 포함).
    entries = items.map((it) => ({
      label: it.display_name?.trim() || it.name,
      qty: it.quantity,
      item: it,
      isAdded: it.is_added_on_scan === true,
    }));
  }

  if (entries.length === 0) return null;

  // 초과분(발주보다 더 챙긴 수량) 사전 계산 — 원문 수량은 그대로 두고 옆에 "(+N 초과)".
  //   초과 = item.scanned_count - item.quantity (>0). over>0 이면 항상 complete의 특수 케이스.
  //   별칭으로 한 item 을 여러 원문 라인이 공유하면 scanned_count 가 합산이므로
  //   중복 표시를 막아 그 item 의 첫 라인에만 배지를 단다.
  const overShownItemIds = new Set<number>();
  const overByEntry = entries.map((e) => {
    const item = e.item;
    const over = item ? Math.max(0, item.scanned_count - item.quantity) : 0;
    // 추가 품목은 "발주 대비"가 아니므로 초과 미표시("(추가)"만).
    if (e.isAdded || over <= 0 || !item) return 0;
    if (overShownItemIds.has(item.item_id)) return 0;
    overShownItemIds.add(item.item_id);
    return over;
  });

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[11px] text-zinc-500 mb-1.5">전체 상품</p>
      {/* 길면 이 영역 안에서만 스크롤 — 검수 카드 공간을 너무 잡아먹지 않게 */}
      <p className="text-sm leading-relaxed max-h-[26vh] overflow-y-auto">
        {entries.map((e, i) => {
          const item = e.item;
          const excluded = item?.excluded === true;
          // 매핑 품목이 완전 완료면 취소선. (부분 진행은 라인 단위로 표시하지 않음)
          const complete =
            !!item && item.scanned_count >= item.quantity && item.quantity > 0;
          // 폴백(품목) 모드에서만 부분표시 유지 — 원문 라인 모드는 생략.
          const partial =
            !useRaw && !excluded && !complete && !!item && item.scanned_count > 0;

          // 색 우선순위: 취소 > 완료 > 추가 > 정상. (취소는 취소선 금지)
          const textClass = excluded
            ? "text-rose-400"
            : complete
              ? "text-green-600 line-through"
              : e.isAdded
                ? "text-blue-600"
                : "text-zinc-800";

          const over = overByEntry[i];

          return (
            <span key={i}>
              {i > 0 && <span className="text-zinc-300 mx-1">/</span>}
              {/* 품명+수량(+동봉/취소/부분)은 한 span — 완료 시 여기에만 취소선 */}
              <span className={textClass}>
                {e.label}
                {e.qty}
                {item?.scan_exempt && (
                  <span className="text-zinc-400 no-underline text-[11px]">
                    {" "}
                    (동봉)
                  </span>
                )}
                {item?.inspection_exempt && (
                  <span className="text-violet-500 no-underline text-[11px]">
                    {" "}
                    (스캔불필요)
                  </span>
                )}
                {excluded && (
                  <span className="text-rose-500 no-underline text-[11px]">
                    {" "}
                    (취소)
                  </span>
                )}
                {partial && (
                  <span className="text-zinc-400 no-underline">
                    {" "}
                    ({item.scanned_count}/{item.quantity})
                  </span>
                )}
              </span>
              {/* 아래 배지들은 취소선 span 밖 suffix — 선이 라벨을 가로지르지 않게 정렬 */}
              {!excluded && over > 0 && (
                <span className="text-amber-600 text-[11px] align-baseline ml-0.5">
                  (+{over} 초과)
                </span>
              )}
              {!excluded && e.isAdded && (
                <span className="text-blue-600 text-[11px] align-baseline ml-0.5">
                  (추가)
                </span>
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
}
