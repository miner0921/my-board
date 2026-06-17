import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { Upload } from "lucide-react";
import DeleteButton from "./DeleteButton";
import SortSelect from "./SortSelect";
import NewItemButton from "./NewItemButton";
import EditItemButton from "./EditItemButton";
import BarcodeTag from "../_components/BarcodeTag";

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
  barcode: string | null;  // 자동 등록 품목은 NULL 가능
  name: string;
  has_image: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  is_auto_created: boolean;
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
  } = await searchParams;
  const q = (qParam ?? "").trim();
  const noBarcode = nbParam === "1";
  const noImage = niParam === "1";
  const isFiltered = q !== "" || noBarcode || noImage;

  // 정렬: 화이트리스트에 없으면 기본(이름순)으로
  const sort = sortParam && SORT_OPTIONS[sortParam] ? sortParam : DEFAULT_SORT;
  const orderBy = SORT_OPTIONS[sort];

  // 동적 WHERE 구성 (검색어 + 바코드없음 + 이미지없음)
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(
      `(i.name ILIKE $${params.length} OR i.barcode ILIKE $${params.length})`
    );
  }
  if (noBarcode) conditions.push(`i.barcode IS NULL`);
  if (noImage) conditions.push(`i.image_data IS NULL`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       i.id, i.barcode, i.name, i.created_by, i.created_at, i.updated_at,
       i.is_auto_created,
       (i.image_data IS NOT NULL) AS has_image,
       u.nickname AS author_nickname
     FROM items i
     LEFT JOIN users u ON i.created_by = u.id
     ${where}
     ORDER BY ${orderBy}`,
    params
  );

  const items: Item[] = result.rows;

  return (
    <div className="max-w-6xl">
      {/* 액션 바 */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-zinc-500">
          출고할 품목을 등록하고 관리합니다
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/warehouse/items/bulk"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
          >
            <Upload size={16} strokeWidth={1.75} />
            CSV 대량 등록
          </Link>
          <NewItemButton />
        </div>
      </div>

      {/* 검색 + 필터 */}
      <form
        action="/warehouse/items"
        method="get"
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="품목명 또는 바코드로 검색"
          className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <label className="inline-flex items-center gap-1.5 px-3 py-2 border border-zinc-300 rounded-lg text-sm cursor-pointer hover:bg-zinc-50 select-none">
          <input
            type="checkbox"
            name="nobarcode"
            value="1"
            defaultChecked={noBarcode}
            className="accent-zinc-900"
          />
          바코드 없음
        </label>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 border border-zinc-300 rounded-lg text-sm cursor-pointer hover:bg-zinc-50 select-none">
          <input
            type="checkbox"
            name="noimage"
            value="1"
            defaultChecked={noImage}
            className="accent-zinc-900"
          />
          이미지 없음
        </label>
        <SortSelect value={sort} />
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
        >
          검색
        </button>
        {isFiltered && (
          <Link
            href="/warehouse/items"
            className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            초기화
          </Link>
        )}
      </form>

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
            const isOwner =
              session.user?.id === String(item.created_by ?? "");
            const isAdmin =
              ((session.user as { role?: string }).role ?? "user") === "admin";
            // 자동 등록 품목은 누구나 수정 가능 (협업).
            // 삭제는 Phase 6부터 관리자 전용.
            const canEdit = item.is_auto_created || isOwner;
            const canDelete = isAdmin;
            return (
              <div
                key={item.id}
                className="border border-zinc-200 rounded-lg overflow-hidden bg-white flex flex-col"
              >
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
                  <div className="mt-1">
                    <BarcodeTag barcode={item.barcode} />
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                    {item.author_nickname ?? "(삭제된 사용자)"} ·{" "}
                    {formatDate(item.created_at)}
                  </p>

                  {/* 수정: 자동 등록이면 누구나, 아니면 본인만 / 삭제: 관리자만 */}
                  {(canEdit || canDelete) && (
                    <div className="flex gap-1 mt-2">
                      {canEdit && <EditItemButton itemId={item.id} />}
                      {canDelete && <DeleteButton itemId={item.id} />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
