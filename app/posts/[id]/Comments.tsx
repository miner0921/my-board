"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type Comment = {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
  author_nickname: string;
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

export default function Comments({ postId }: { postId: number }) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // 댓글 목록 불러오기
  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      const data = await res.json();
      if (res.ok) {
        setComments(data.comments);
      }
    } catch (err) {
      console.error("댓글 조회 실패:", err);
    } finally {
      setFetching(false);
    }
  };

  // 페이지 로드 시 댓글 목록 불러오기
  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // 댓글 작성
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "댓글 작성 실패");
        setLoading(false);
        return;
      }

      // 새 댓글을 목록에 추가
      setComments((prev) => [...prev, data.comment]);
      setContent(""); // 입력창 비우기
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 댓글 삭제
  const handleDelete = async (commentId: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(
        `/api/posts/${postId}/comments/${commentId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "삭제 실패");
        return;
      }

      // 목록에서 제거
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-bold">
        댓글 <span className="text-zinc-400 font-normal">{comments.length}</span>
      </h2>

      {/* 댓글 목록 */}
      {fetching ? (
        <p className="text-sm text-zinc-400">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-zinc-400 py-4">
          첫 댓글을 남겨보세요!
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {comments.map((comment) => {
            const isAuthor = session?.user?.id === String(comment.user_id);
            return (
              <li key={comment.id} className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-900">
                      {comment.author_nickname}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  {isAuthor && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                  {comment.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* 댓글 작성 폼 */}
      <div className="pt-4 border-t border-zinc-100">
        {session ? (
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="댓글을 입력하세요"
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-[80px] resize-y"
              required
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="px-4 py-1.5 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
              >
                {loading ? "작성 중..." : "댓글 작성"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-2">
            <Link href="/login" className="text-zinc-900 underline">
              로그인
            </Link>
            {" "}후 댓글을 작성할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}