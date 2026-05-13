import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import DeleteButton from "./DeleteButton";
import Comments from "./Comments";

type Post = {
  id: number;
  title: string;
  barcode: string | null;
  content: string;
  has_image: boolean;
  created_at: string;
  updated_at: string;
  user_id: number;
  author_nickname: string;
};

// 날짜 포맷 함수
function formatDate(date: string) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// Next.js 15: params는 Promise
type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  // DB에서 품목 가져오기 (BYTEA 본체는 가져오지 않고 존재 여부만)
  const result = await query(
    `SELECT
       p.id, p.title, p.barcode, p.content,
       (p.image_data IS NOT NULL) AS has_image,
       p.created_at, p.updated_at, p.user_id,
       u.nickname AS author_nickname
     FROM posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = $1`,
    [id]
  );

  // 글이 없으면 404 페이지
  if (result.rows.length === 0) {
    notFound();
  }

  const post: Post = result.rows[0];
  const isAuthor = session?.user?.id === String(post.user_id);
  const isEdited = post.updated_at !== post.created_at;

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      {/* 목록으로 돌아가기 */}
      <Link
        href="/"
        className="inline-block text-sm text-zinc-500 hover:text-zinc-900 mb-4"
      >
        ← 목록으로
      </Link>

      {/* 품목 본문 */}
      <article className="border border-zinc-200 rounded-lg p-6 bg-white">
        {/* 품목명 */}
        <h1 className="text-2xl font-bold mb-3">{post.title}</h1>

        {/* 바코드 */}
        {post.barcode && (
          <div className="mb-3 text-sm text-zinc-600">
            <span className="text-zinc-400 mr-2">바코드</span>
            <span className="font-mono">{post.barcode}</span>
          </div>
        )}

        {/* 메타 정보 */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 text-sm text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="font-medium text-zinc-700">
              {post.author_nickname}
            </span>
            <span>·</span>
            <span>{formatDate(post.created_at)}</span>
            {isEdited && (
              <span className="text-xs text-zinc-400">(수정됨)</span>
            )}
          </div>
        </div>

        {/* 대표 이미지 — DB의 BYTEA를 별도 라우트에서 서빙 */}
        {post.has_image && (
          <div className="pt-6">
            {/* 동적 라우트 응답이라 next/image 대신 img 사용. */}
            {/* updated_at을 쿼리스트링으로 붙여 수정 시 캐시가 자동 갱신되도록 함 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/posts/${post.id}/image?v=${new Date(post.updated_at).getTime()}`}
              alt={post.title}
              className="max-w-full max-h-[500px] rounded-lg border border-zinc-200"
            />
          </div>
        )}

        {/* 본문 */}
        <div className="py-6 text-zinc-800 whitespace-pre-wrap leading-relaxed">
          {post.content}
        </div>

        {/* 본인 글이면 수정/삭제 버튼 */}
        {isAuthor && (
          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-100">
            <Link
              href={`/posts/${post.id}/edit`}
              className="px-4 py-1.5 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
            >
              수정
            </Link>
            <DeleteButton postId={post.id} />
          </div>
        )}
      </article>

      {/* 댓글 영역 (다음 Step 9에서 채움) */}
      <div className="mt-8 border border-zinc-200 rounded-lg p-6 bg-white">
        <Comments postId={post.id} />
      </div>
    </main>
  );
}