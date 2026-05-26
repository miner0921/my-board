"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;
  const { data: session, status } = useSession();

  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [originalUserId, setOriginalUserId] = useState<number | null>(null);

  // 이미지 상태:
  // hasExistingImage = 서버에 저장된 기존 이미지가 있는지
  // existingImageStamp = 현재 이미지의 캐시 무효화용 타임스탬프
  // newImageFile / newImagePreview = 사용자가 새로 고른 파일
  // removeExisting = 기존 이미지를 떼겠다는 의사 (새 파일 없이)
  const [hasExistingImage, setHasExistingImage] = useState(false);
  const [existingImageStamp, setExistingImageStamp] = useState<number>(0);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // 기존 품목 불러오기
  useEffect(() => {
    const fetchItem = async () => {
      try {
        const res = await fetch(`/api/warehouse/items/${itemId}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "품목을 불러올 수 없습니다.");
          setFetching(false);
          return;
        }

        setBarcode(data.item.barcode);
        setName(data.item.name);
        setHasExistingImage(!!data.item.has_image);
        setExistingImageStamp(new Date(data.item.updated_at).getTime());
        setOriginalUserId(data.item.created_by);
      } catch (err) {
        console.error(err);
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setFetching(false);
      }
    };

    fetchItem();
  }, [itemId]);

  // 권한 체크
  useEffect(() => {
    if (status === "loading" || fetching) return;

    if (status === "unauthenticated") {
      alert("로그인이 필요합니다.");
      router.push("/login");
      return;
    }

    if (
      originalUserId !== null &&
      session?.user?.id !== String(originalUserId)
    ) {
      alert("수정 권한이 없습니다.");
      router.push("/warehouse/items");
    }
  }, [status, fetching, originalUserId, session, router]);

  useEffect(() => {
    return () => {
      if (newImagePreview) URL.revokeObjectURL(newImagePreview);
    };
  }, [newImagePreview]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setError("");

    if (newImagePreview) URL.revokeObjectURL(newImagePreview);

    if (!file) {
      setNewImageFile(null);
      setNewImagePreview(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하만 업로드할 수 있습니다.");
      e.target.value = "";
      return;
    }

    setNewImageFile(file);
    setNewImagePreview(URL.createObjectURL(file));
    setRemoveExisting(false);
  };

  const handleClearNew = () => {
    if (newImagePreview) URL.revokeObjectURL(newImagePreview);
    setNewImageFile(null);
    setNewImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveExisting = () => {
    setRemoveExisting(true);
    handleClearNew();
  };

  const handleUndoRemoveExisting = () => {
    setRemoveExisting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("barcode", barcode);
      formData.append("name", name);
      if (newImageFile) {
        formData.append("image", newImageFile);
      } else if (removeExisting) {
        formData.append("removeImage", "1");
      }

      const res = await fetch(`/api/warehouse/items/${itemId}`, {
        method: "PUT",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "수정에 실패했습니다.");
        setLoading(false);
        return;
      }

      router.push("/warehouse/items");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  if (fetching || status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-zinc-500">로딩 중...</p>
      </div>
    );
  }

  if (error && !name) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Link
          href="/warehouse/items"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← 품목 목록
        </Link>
      </div>
    );
  }

  const showingNewPreview = !!newImagePreview;
  const showingExisting =
    !showingNewPreview && !removeExisting && hasExistingImage;

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <Link
        href="/warehouse/items"
        className="inline-block text-sm text-zinc-500 hover:text-zinc-900 mb-4"
      >
        ← 품목 목록
      </Link>
      <h1 className="text-2xl font-bold mb-6">품목 수정</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 바코드 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            바코드
          </label>
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
            maxLength={100}
            required
          />
          <p className="text-xs text-zinc-400 mt-1">{barcode.length} / 100자</p>
        </div>

        {/* 품목명 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            품목명
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            maxLength={200}
            required
          />
          <p className="text-xs text-zinc-400 mt-1">{name.length} / 200자</p>
        </div>

        {/* 이미지 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            대표 이미지{" "}
            <span className="text-zinc-400 text-xs">
              (선택, JPG/PNG/GIF/WEBP · 5MB 이하)
            </span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageChange}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-50 file:cursor-pointer"
          />

          {showingNewPreview && (
            <div className="mt-3">
              <p className="text-xs text-zinc-500 mb-1">새 이미지 미리보기</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={newImagePreview!}
                alt="새 이미지 미리보기"
                className="max-h-64 rounded-lg border border-zinc-200"
              />
              <button
                type="button"
                onClick={handleClearNew}
                className="block mt-2 text-xs text-zinc-500 hover:text-red-600"
              >
                선택 취소
              </button>
            </div>
          )}

          {showingExisting && (
            <div className="mt-3">
              <p className="text-xs text-zinc-500 mb-1">현재 이미지</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/warehouse/items/${itemId}/image?v=${existingImageStamp}`}
                alt="현재 이미지"
                className="max-h-64 rounded-lg border border-zinc-200"
              />
              <button
                type="button"
                onClick={handleRemoveExisting}
                className="block mt-2 text-xs text-zinc-500 hover:text-red-600"
              >
                이미지 제거
              </button>
            </div>
          )}

          {removeExisting && !showingNewPreview && (
            <div className="mt-3 text-xs text-zinc-500">
              저장 시 기존 이미지가 제거됩니다.{" "}
              <button
                type="button"
                onClick={handleUndoRemoveExisting}
                className="underline hover:text-zinc-900"
              >
                되돌리기
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/warehouse/items"
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
