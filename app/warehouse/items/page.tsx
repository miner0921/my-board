import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import DeleteButton from "./DeleteButton";

type Item = {
  id: number;
  barcode: string;
  name: string;
  has_image: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  author_nickname: string | null;
};

function formatDate(date: string) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ItemListPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { q: qParam } = await searchParams;
  const q = (qParam ?? "").trim();
  const isSearching = q !== "";

  const baseSelect = `
    SELECT
      i.id, i.barcode, i.name, i.created_by, i.created_at, i.updated_at,
      (i.image_data IS NOT NULL) AS has_image,
      u.nickname AS author_nickname
    FROM items i
    LEFT JOIN users u ON i.created_by = u.id
  `;

  const result = isSearching
    ? await query(
        `${baseSelect}
         WHERE i.name ILIKE $1 OR i.barcode ILIKE $1
         ORDER BY i.created_at DESC`,
        [`%${q}%`]
      )
    : await query(`${baseSelect} ORDER BY i.created_at DESC`);

  const items: Item[] = result.rows;

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <Link
          href="/warehouse"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← 바코드 관리
        </Link>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">품목 관리</h1>
            <p className="text-sm text-zinc-500 mt-1">
              출고할 품목을 등록하고 관리합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/warehouse/items/bulk"
              className="px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
            >
              📥 CSV 대량 등록
            </Link>
            <Link
              href="/warehouse/items/new"
              className="px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium"
            >
              + 새 품목 등록
            </Link>
          </div>
        </div>
      </div>

      {/* 검색창 */}
      <form
        action="/warehouse/items"
        method="get"
        className="mb-6 flex gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="품목명 또는 바코드로 검색"
          className="flex-1 px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
        >
          검색
        </button>
        {isSearching && (
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
        isSearching ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">검색 결과가 없습니다.</p>
            <p className="text-xs text-zinc-400">
              <span className="font-mono">&ldquo;{q}&rdquo;</span>에 해당하는 품목이 없습니다.
            </p>
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-3">아직 등록된 품목이 없습니다.</p>
            <Link
              href="/warehouse/items/new"
              className="inline-block px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
            >
              첫 품목을 등록해보세요
            </Link>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => {
            const isOwner =
              session.user?.id === String(item.created_by ?? "");
            return (
              <div
                key={item.id}
                className="border border-zinc-200 rounded-lg overflow-hidden bg-white flex flex-col"
              >
                {/* 썸네일 */}
                <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
                  {item.has_image ? (
                    /* BYTEA는 별도 라우트에서 서빙. updated_at 으로 캐시 무효화. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/warehouse/items/${item.id}/image?v=${new Date(item.updated_at).getTime()}`}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-zinc-300">이미지 없음</span>
                  )}
                </div>

                {/* 본문 */}
                <div className="p-3 flex-1 flex flex-col">
                  <h2 className="font-medium text-sm text-zinc-900 line-clamp-2 mb-1">
                    {item.name}
                  </h2>
                  <p className="font-mono text-xs text-zinc-600 mb-2 truncate">
                    {item.barcode}
                  </p>
                  <div className="text-[11px] text-zinc-400 mt-auto">
                    {item.author_nickname ?? "(삭제된 사용자)"} ·{" "}
                    {formatDate(item.created_at)}
                  </div>

                  {/* 본인 등록 품목일 때만 수정/삭제 */}
                  {isOwner && (
                    <div className="flex gap-1.5 mt-3">
                      <Link
                        href={`/warehouse/items/${item.id}/edit`}
                        className="flex-1 text-center px-2 py-1.5 text-xs border border-zinc-300 rounded hover:bg-zinc-50 transition"
                      >
                        수정
                      </Link>
                      <DeleteButton itemId={item.id} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
