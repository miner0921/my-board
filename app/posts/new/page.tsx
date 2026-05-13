"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import Link from "next/link";

export default function NewPostPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [barcode, setBarcode] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 로그인 안 한 사용자는 로그인 페이지로 보냄
  useEffect(() => {
    if (status === "unauthenticated") {
      alert("로그인이 필요합니다.");
      router.push("/login");
    }
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, barcode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "품목 등록에 실패했습니다.");
        setLoading(false);
        return;
      }

      // 작성 성공 → 작성한 글의 상세 페이지로 이동
      router.push(`/posts/${data.post.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 로딩 중일 때
  if (status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-zinc-500">로딩 중...</p>
      </div>
    );
  }

  // 비로그인 시 (리다이렉트되기 전 잠깐 보일 수 있음)
  if (!session) {
    return null;
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">새 품목 등록</h1>

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
            placeholder="품목명을 입력하세요"
            maxLength={200}
            required
          />
          <p className="text-xs text-zinc-400 mt-1">
            {title.length} / 200자
          </p>
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
          <p className="text-xs text-zinc-400 mt-1">
            {barcode.length} / 50자
          </p>
        </div>

        {/* 작성자 (자동 표시, 수정 불가) */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            작성자
          </label>
          <input
            type="text"
            value={session.user?.name || ""}
            disabled
            className="w-full px-4 py-2 border border-zinc-200 bg-zinc-50 text-zinc-500 rounded-lg"
          />
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
            placeholder="내용을 입력하세요"
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* 버튼들 */}
        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/"
            className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {loading ? "등록 중..." : "등록"}
          </button>
        </div>
      </form>
    </main>
  );
}