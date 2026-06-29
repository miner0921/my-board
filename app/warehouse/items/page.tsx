import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import DeleteButton from "./DeleteButton";
import SortSelect from "./SortSelect";
import CategorySelect from "./CategorySelect";
import FilterCheckbox from "./FilterCheckbox";
import NewItemButton from "./NewItemButton";
import EditItemButton from "./EditItemButton";
import BulkUploadButton from "./BulkUploadButton";
import BarcodeTag from "../_components/BarcodeTag";
import {
  BulkSelectProvider,
  BulkActionButton,
  BulkSelectInline,
  BulkCheckbox,
} from "../_components/BulkSelect";

// 정렬 옵션 화이트리스트. key는 SortSelect의 <option value>와 일치.
// orderBy는 고정 문자열만 사용 (사용자 입력을 SQL에 직접 넣지 않음).
// 동률 시 i.id로 안정 정렬 (created_at은 대량 업로드 시 동일값 다수).
const SORT_OPTIONS: Record<string, string> = {
  name: "i.name ASC, i.id ASC",
  recent: "i.created_at DESC, i.id DESC",
  oldest: "i.created_at ASC, i.id ASC",
  nobarcode: "(i.barcode IS NULL) DESC, i.name ASC, i.id ASC",
};
const DEFAULT_SORT = "name";

type Item = {
  id: number;
  product_code: string | null; // 자동 등록 품목은 NULL
  category: string | null; // 구분
  kind: string | null; // 종류
  barcode: string | null;  // 자동 등록 품목은 NULL 가능
  name: string;
  has_image: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  is_auto_created: boolean;
  scan_exempt: boolean;
  author_nickname: string | null;
};

// 항상 한국시간(Asia/Seoul)으로 표시 (서버 컴포넌트, 환경 TZ 무관).
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

type PageProps = {
  searchParams: Promise<{
    q?: string;
    nobarcode?: string;
    noimage?: string;
    sort?: string;
    cat?: string;
    deleted?: string;
  }>;
};

export default async function ItemListPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const {
    q: qParam,
    nobarcode: nbParam,
    noimage: niParam,
    sort: sortParam,
    cat: catParam,
    deleted: delParam,
  } = await searchParams;
  const q = (qParam ?? "").trim();
  const noBarcode = nbParam === "1";
  const noImage = niParam === "1";
  const cat = (catParam ?? "").trim();
  const isFiltered = q !== "" || noBarcode || noImage || cat !== "";

  // 숨김 보기/복구는 관리자만
  const isAdmin =
    ((session.user as { role?: string }).role ?? "user") === "admin";
  const viewDeleted = isAdmin && delParam === "1";

  // 정렬: 화이트리스트에 없으면 기본(이름순)으로
  const sort = sortParam && SORT_OPTIONS[sortParam] ? sortParam : DEFAULT_SORT;
  const orderBy = SORT_OPTIONS[sort];

  // 동적 WHERE 구성. 숨김 여부 필터를 항상 먼저 적용.
  const conditions: string[] = [
    viewDeleted ? "i.deleted_at IS NOT NULL" : "i.deleted_at IS NULL",
  ];
  const params: unknown[] = [];
  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(
      `(i.name ILIKE $${params.length} OR i.barcode ILIKE $${params.length} OR i.product_code ILIKE $${params.length})`
    );
  }
  if (noBarcode) conditions.push(`i.barcode IS NULL`);
  if (noImage) conditions.push(`i.image_data IS NULL`);
  // 카테고리 필터: 구분(category) 컬럼 기준. "__none__"=구분 없는 품목.
  if (cat === "__none__") {
    conditions.push(`i.category IS NULL`);
  } else if (cat !== "") {
    params.push(cat);
    conditions.push(`i.category = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       i.id, i.product_code, i.category, i.kind, i.barcode, i.name,
       i.created_by, i.created_at, i.updated_at,
       i.is_auto_created, i.scan_exempt,
       (i.image_data IS NOT NULL) AS has_image,
       u.nickname AS author_nickname
     FROM items i
     LEFT JOIN users u ON i.created_by = u.id
     ${where}
     ORDER BY ${orderBy}`,
    params
  );

  const items: Item[] = result.rows;

  // 카테고리(구분) 드롭다운 옵션 (전체 품목 기준 distinct — 다른 필터와 무관하게 안정)
  const catResult = await query(
    `SELECT DISTINCT category AS cat
       FROM items
      WHERE deleted_at IS NULL AND category IS NOT NULL AND category <> ''
      ORDER BY cat`
  );
  const categories: string[] = catResult.rows
    .map((r) => r.cat as string | null)
    .filter((c): c is string => !!c);

  return (
    <BulkSelectProvider>
    <div className="max-w-6xl">
      {/* 버튼 줄 — 삭제 보기=되돌아가기(왼쪽), 활성=대량 업로드·새 품목(오른쪽) */}
      <div className="mb-4 flex">
        {viewDeleted ? (
          <Link
            href="/warehouse/items"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
          >
            ← 되돌아가기
          </Link>
        ) : isAdmin ? (
          // 대량등록·새 품목 등록은 관리자 전용
          <div className="ml-auto flex items-center gap-2">
            <BulkUploadButton />
            <NewItemButton />
          </div>
        ) : null}
      </div>

      {/* 검색 + 필터 (두 줄: 윗줄=검색어, 아랫줄=카테고리·정렬·체크박스·초기화) */}
      <form action="/warehouse/items" method="get" className="mb-6 space-y-2">
        {viewDeleted && <input type="hidden" name="deleted" value="1" />}

        {/* 윗줄: 검색어 + 검색 버튼 (엔터로도 제출 — form 기본 submit) */}
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="품목명·바코드·품목코드로 검색"
            className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition bg-[#042C53]"
          >
            <Search size={16} strokeWidth={2} />
            검색
          </button>
        </div>

        {/* 아랫줄: 카테고리 → 정렬 → 체크박스 2개(즉시 반영) + 초기화(맨 오른쪽) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <CategorySelect value={cat} categories={categories} />
          <SortSelect value={sort} />
          <FilterCheckbox name="nobarcode" label="바코드 없음" checked={noBarcode} />
          <FilterCheckbox name="noimage" label="이미지 없음" checked={noImage} />
          {/* 오른쪽 끝: 초기화 + 선택 삭제/복구 + 삭제 항목 보기 */}
          <div className="ml-auto flex items-center gap-2">
            {isFiltered && (
              <Link
                href={viewDeleted ? "/warehouse/items?deleted=1" : "/warehouse/items"}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
              >
                초기화
              </Link>
            )}
            {isAdmin && (
              <BulkActionButton
                resource="items"
                viewDeleted={viewDeleted}
                noun="품목"
                hideVerb="삭제"
              />
            )}
            {isAdmin && !viewDeleted && (
              <Link
                href="/warehouse/items?deleted=1"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
              >
                삭제 항목 보기
              </Link>
            )}
          </div>
        </div>
      </form>

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
                  {/* 선택 체크박스 (관리자만) */}
                  {isAdmin && (
                    <div className="absolute top-1 left-1 z-10 bg-white/90 rounded p-0.5">
                      <BulkCheckbox id={item.id} />
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
                    {item.product_code && (
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-400 truncate">
                        {item.product_code}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <BarcodeTag barcode={item.barcode} />
                      {item.scan_exempt && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-500 border-zinc-200">
                          스캔 불필요
                        </span>
                      )}
                      {viewDeleted && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border bg-red-50 text-red-600 border-red-200">
                          숨김
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                      {item.author_nickname ?? "(삭제된 사용자)"} ·{" "}
                      {formatDate(item.created_at)}
                    </p>

                    {/* 활성 보기에서만 수정/삭제 버튼 (숨김 보기는 복구 바로 처리) */}
                    {!viewDeleted && (
                      <div className="flex gap-1 mt-2">
                        <EditItemButton itemId={item.id} isAdmin={isAdmin} />
                        {isAdmin && <DeleteButton itemId={item.id} />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
      )}
    </div>
    </BulkSelectProvider>
  );
}
