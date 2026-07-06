import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import SortSelect from "./SortSelect";
import CategorySelect from "./CategorySelect";
import FilterCheckbox from "./FilterCheckbox";
import NewItemButton from "./NewItemButton";
import BulkUploadButton from "./BulkUploadButton";
import ItemList, { type Item } from "./ItemList";
import Pagination from "./Pagination";
import { BulkSelectProvider, BulkActionButton } from "../_components/BulkSelect";

// 한 페이지 품목 수 (번호 페이지네이션)
const PAGE_SIZE = 10;

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

type PageProps = {
  searchParams: Promise<{
    q?: string;
    nobarcode?: string;
    noimage?: string;
    sort?: string;
    cat?: string;
    deleted?: string;
    page?: string;
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
    page: pageParam,
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
      `(i.name ILIKE $${params.length} OR i.barcode ILIKE $${params.length} OR i.product_code ILIKE $${params.length}
        OR EXISTS (SELECT 1 FROM item_barcodes b WHERE b.item_id = i.id AND b.barcode ILIKE $${params.length}))`
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

  // 전체 건수 (같은 WHERE·params) → 페이지 수 계산
  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM items i ${where}`,
    params
  );
  const total: number = countResult.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // page 파라미터 클램프(범위 밖이면 보정)
  const reqPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const page = Math.min(reqPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // 해당 페이지 10건만 조회 (LIMIT/OFFSET)
  params.push(PAGE_SIZE);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const result = await query(
    `SELECT
       i.id, i.product_code, i.category, i.kind, i.barcode, i.name,
       i.created_by, i.created_at, i.updated_at,
       i.is_auto_created, i.scan_exempt,
       (i.image_data IS NOT NULL) AS has_image,
       (SELECT COUNT(*)::int FROM item_barcodes b WHERE b.item_id = i.id) AS extra_barcode_count,
       u.nickname AS author_nickname
     FROM items i
     LEFT JOIN users u ON i.created_by = u.id
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const items: Item[] = result.rows;

  // 페이지 이동 시 유지할 현재 조건(page 제외)
  const baseParams: Record<string, string> = {};
  if (q !== "") baseParams.q = q;
  if (noBarcode) baseParams.nobarcode = "1";
  if (noImage) baseParams.noimage = "1";
  if (sort !== DEFAULT_SORT) baseParams.sort = sort;
  if (cat !== "") baseParams.cat = cat;
  if (viewDeleted) baseParams.deleted = "1";

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

      {/* 목록(전체선택·빈 상태·카드 그리드) — client 컴포넌트로 분리.
          router.refresh() 후 새 items prop을 받아 즉시 갱신(송장 목록과 동일 패턴). */}
      <ItemList
        items={items}
        isAdmin={isAdmin}
        viewDeleted={viewDeleted}
        isFiltered={isFiltered}
      />

      {items.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          total={total}
          baseParams={baseParams}
        />
      )}
    </div>
    </BulkSelectProvider>
  );
}
