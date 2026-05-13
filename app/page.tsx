import Link from "next/link";
import { auth } from "@/auth";
import { query } from "@/lib/db";

// 게시글(품목) 타입 정의
type Post = {
  id: number;
  title: string;
  barcode: string | null;
  content: string;
  created_at: string;
  user_id: number;
  author_nickname: string;
  comment_count: string; // PostgreSQL COUNT는 문자열로 반환됨
};

// 날짜를 보기 좋게 변환 ("2026-05-12 21:30")
function formatDate(date: string) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default async function Home() {
  const session = await auth();

  // DB에서 품목 목록 직접 가져오기 (서버 컴포넌트)
  const result = await query(
    `SELECT
       p.id, p.title, p.barcode, p.content, p.created_at, p.user_id,
       u.nickname AS author_nickname,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
     FROM posts p
     JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC`
  );
  const posts: Post[] = result.rows;

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      {/* 상단: 제목 + 글쓰기 버튼 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">품목리스트</h1>
        {session ? (
          <Link
            href="/posts/new"
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
          >
            ✏️ 글쓰기
          </Link>
        ) : (
          <Link
            href="/login"
            className="px-4 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 transition"
          >
            로그인 후 글쓰기
          </Link>
        )}
      </div>

      {/* 품목 목록 */}
      {posts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-300 rounded-lg">
          아직 등록된 품목이 없습니다. 첫 품목을 등록해보세요!
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          {/* 헤더 */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-sm font-medium text-zinc-600">
            <div className="col-span-4">품목명</div>
            <div className="col-span-3">바코드</div>
            <div className="col-span-2 text-center">작성자</div>
            <div className="col-span-1 text-center">댓글</div>
            <div className="col-span-2 text-center">작성일</div>
          </div>

          {/* 목록 */}
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition text-sm"
            >
              <div className="col-span-4 font-medium text-zinc-900 truncate">
                {post.title}
                {Number(post.comment_count) > 0 && (
                  <span className="ml-2 text-zinc-500 text-xs">
                    [{post.comment_count}]
                  </span>
                )}
              </div>
              <div className="col-span-3 text-zinc-600 font-mono text-xs truncate">
                {post.barcode || <span className="text-zinc-300">-</span>}
              </div>
              <div className="col-span-2 text-center text-zinc-600">
                {post.author_nickname}
              </div>
              <div className="col-span-1 text-center text-zinc-600">
                {post.comment_count}
              </div>
              <div className="col-span-2 text-center text-zinc-500 text-xs">
                {formatDate(post.created_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}