"use client";

import { useState } from "react";
import BarcodeTag from "../_components/BarcodeTag";
import { BulkSelectInline, BulkCheckbox } from "../_components/BulkSelect";
import EditItemButton from "./EditItemButton";
import DeleteButton from "./DeleteButton";
import NewItemButton from "./NewItemButton";

// ─────────────────────────────────────────────────────────────
// 품목 목록(전체선택 + 빈 상태 + 카드 그리드) — client 컴포넌트.
//   ★ 송장 목록(PaginatedInvoiceList, A안)과 동일하게 items를 prop으로 받아
//     useState + prevItems 동기화로 그린다. router.refresh() 후 서버가 새 items
//     배열을 내려주면 그때 내부 state를 맞춰 즉시 반영(prod 캐시 환경 대응).
//   카드 내용/디자인/권한 동작은 기존 서버 렌더와 동일 — 렌더 위치만 client로 이동.
// ─────────────────────────────────────────────────────────────

export type Item = {
  id: number;
  product_code: string | null; // 자동 등록 품목은 NULL
  category: string | null; // 구분
  kind: string | null; // 종류
  barcode: string | null; // 자동 등록 품목은 NULL 가능
  name: string;
  has_image: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  is_auto_created: boolean;
  scan_exempt: boolean;
  author_nickname: string | null;
};

// 항상 한국시간(Asia/Seoul)으로 표시 (timeZone 고정 → 서버/브라우저 결과 동일).
function formatDate(date: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export default function ItemList({
  items: initialItems,
  isAdmin,
  viewDeleted,
  isFiltered,
}: {
  items: Item[];
  isAdmin: boolean;
  viewDeleted: boolean;
  isFiltered: boolean;
}) {
  // 서버 데이터(prop)가 바뀌면 렌더 중 내부 state 재동기화 (송장 목록 A안과 동일).
  //   router.refresh()(수정·신규·삭제·복구 후)일 때만 새 배열 참조가 오므로 그때만 반영.
  const [items, setItems] = useState(initialItems);
  const [prevItems, setPrevItems] = useState(initialItems);
  if (initialItems !== prevItems) {
    setPrevItems(initialItems);
    setItems(initialItems);
  }

  return (
    <>
      {/* 전체선택 (관리자 · 박스 없이) — 목록 있을 때만 */}
      {isAdmin && items.length > 0 && (
        <BulkSelectInline allIds={items.map((i) => i.id)} />
      )}

      {/* 빈 상태 */}
      {items.length === 0 ? (
        isFiltered ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">검색 결과가 없습니다.</p>
            <p className="text-xs text-zinc-400">
              조건에 맞는 품목이 없습니다. 검색어나 필터를 바꿔보세요.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-3">아직 등록된 품목이 없습니다.</p>
            <NewItemButton />
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {items.map((item) => {
            // 수정은 로그인한 누구나 가능(작업자=바코드·이미지만, 관리자=전체).
            //   필드 제한은 ItemForm(프론트)과 PUT API(서버)가 역할 기준으로 적용.
            return (
              <div
                key={item.id}
                className="relative border border-zinc-200 rounded-lg overflow-hidden bg-white flex flex-col"
              >
                {/* 선택 체크박스 (관리자만) — 이미지 좌상단 오버레이.
                    ★ z-index 없음: absolute 만으로 이미지 위에 뜨고, stacking context를
                      만들지 않아 카드 안의 수정 모달(fixed z-50)이 카드 밖으로 정상 노출됨. */}
                {isAdmin && (
                  <div className="absolute top-1 left-1 bg-white/90 rounded p-0.5">
                    <BulkCheckbox id={item.id} />
                  </div>
                )}

                {/* 수정/삭제 오버레이 아이콘 — 이미지 우상단(활성 보기만, 항상 표시).
                    ★ z-index 없음(모달 갇힘 방지) — 위 체크박스와 동일 이유. */}
                {!viewDeleted && (
                  <div className="absolute top-1 right-1 flex gap-1">
                    <EditItemButton itemId={item.id} isAdmin={isAdmin} variant="icon" />
                    {isAdmin && <DeleteButton itemId={item.id} variant="icon" />}
                  </div>
                )}

                {/* 썸네일 (이미지 위) */}
                <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
                  {item.has_image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/warehouse/items/${item.id}/image?v=${new Date(item.updated_at).getTime()}`}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[11px] text-zinc-300">이미지 없음</span>
                  )}
                </div>

                {/* 정보 (아래) */}
                <div className="p-2 flex-1 flex flex-col">
                  <h2 className="font-medium text-[11px] sm:text-xs text-zinc-900 line-clamp-2 leading-snug">
                    {item.name}
                  </h2>
                  {/* 품목코드 · 바코드 한 줄 (있는 것만) */}
                  {(item.product_code || item.barcode) && (
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-400 truncate">
                      {[item.product_code, item.barcode].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {/* 배지: 바코드 미등록 / 숨김 — 품목명 아래 현행 유지 */}
                  {(!item.barcode || viewDeleted) && (
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      {!item.barcode && <BarcodeTag barcode={null} />}
                      {viewDeleted && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-600 border-red-200">
                          숨김
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                    {item.author_nickname ?? "(삭제된 사용자)"} ·{" "}
                    {formatDate(item.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
