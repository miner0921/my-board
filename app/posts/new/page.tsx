"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function NewPostPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [barcode, setBarcode] = useState("");
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 로그인 안 한 사용자는 로그인 페이지로 보냄
  useEffect(() => {
    if (status === "unauthenticated") {
      alert("로그인이 필요합니다.");
      router.push("/login");
    }
  }, [status, router]);

  // 미리보기 URL은 컴포넌트 언마운트 시 해제
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setError("");

    // 이전 미리보기 정리
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하만 업로드할 수 있습니다.");
      e.target.value = "";
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // multipart/form-data 로 전송 (Content-Type은 브라우저가 자동 설정)
      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      formData.append("barcode", barcode);
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch("/api/posts", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "품목 등록에 실패했습니다.");
        setLoading(false);
        return;
      }

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

        {/* 이미지 (선택) */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            대표 이미지 <span className="text-zinc-400 text-xs">(선택, JPG/PNG/GIF/WEBP · 5MB 이하)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageChange}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-50 file:cursor-pointer"
          />
          {imagePreview && (
            <div className="mt-3 inline-block relative">
              {/* 미리보기는 외부 URL이 아니라 blob:이라 next/image 대신 img 사용 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="미리보기"
                className="max-h-64 rounded-lg border border-zinc-200"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="mt-2 text-xs text-zinc-500 hover:text-red-600"
              >
                이미지 제거
              </button>
            </div>
          )}
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
