"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;
  const { data: session, status } = useSession();

  const [title, setTitle] = useState("");
  const [barcode, setBarcode] = useState("");
  const [content, setContent] = useState("");
  const [originalUserId, setOriginalUserId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // 기존 글 내용 불러오기
  useEffect(() => {
    const fetchPost = async () => {
      try {
        const res = await fetch(`/api/posts/${postId}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "게시글을 불러올 수 없습니다.");
          setFetching(false);
          return;
        }

        setTitle(data.post.title);
        setBarcode(data.post.barcode ?? "");
        setContent(data.post.content);
        setOriginalUserId(data.post.user_id);
      } catch (err) {
        console.error(err);
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setFetching(false);
      }
    };

    fetchPost();
  }, [postId]);

  // 권한 체크: 비로그인 또는 본인 글이 아니면 막기
  useEffect(() => {
    if (status === "loading" || fetching) return;

    if (status === "unauthenticated") {
      alert("로그인이 필요합니다.");
      router.push("/login");
      return;
    }

    if (originalUserId !== null && session?.user?.id !== String(originalUserId)) {
      alert("수정 권한이 없습니다.");
      router.push(`/posts/${postId}`);
    }
  }, [status, fetching, originalUserId, session, router, postId]);

  // 수정 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, barcode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "수정에 실패했습니다.");
        setLoading(false);
        return;
      }

      router.push(`/posts/${postId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 로딩 중
  if (fetching || status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-zinc-500">로딩 중...</p>
      </div>
    );
  }

  // 글을 불러오지 못한 경우
  if (error && !title) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← 목록으로
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">품목 수정</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 품목명 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            품목명
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            maxLength={200}
            required
          />
          <p className="text-xs text-zinc-400 mt-1">{title.length} / 200자</p>
        </div>

        {/* 바코드 (선택) */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            바코드 <span className="text-zinc-400 text-xs">(선택)</span>
          </label>
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
            placeholder="예: 8801234567890"
            maxLength={50}
          />
          <p className="text-xs text-zinc-400 mt-1">{barcode.length} / 50자</p>
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            내용
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-[300px] resize-y"
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-2">
          <Link
            href={`/posts/${postId}`}
            className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {loading ? "수정 중..." : "수정 완료"}
          </button>
        </div>
      </form>
    </main>
  );
}