"use client";

import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// 품목 등록/수정 공용 폼.
//   - mode="create": 새 품목 등록 (POST /api/warehouse/items)
//   - mode="edit":   기존 품목 수정 (GET 으로 초기값 로드 → PUT)
//   - 검증/이미지/API 호출 로직은 기존 new·edit 페이지 그대로.
//   - 모달 안에서 사용. 성공 시 onSuccess(), 취소 시 onCancel().
// ─────────────────────────────────────────────────────────────

type Props =
  | { mode: "create"; onSuccess: () => void; onCancel: () => void }
  | { mode: "edit"; itemId: number; onSuccess: () => void; onCancel: () => void };

export default function ItemForm(props: Props) {
  const isEdit = props.mode === "edit";
  const editItemId = props.mode === "edit" ? props.itemId : null;

  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [scanExempt, setScanExempt] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  // 이미지 상태
  const [hasExistingImage, setHasExistingImage] = useState(false);
  const [existingImageStamp, setExistingImageStamp] = useState<number>(0);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 수정 모드: 기존 품목 불러오기
  useEffect(() => {
    if (editItemId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/warehouse/items/${editItemId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "품목을 불러올 수 없습니다.");
          setFetching(false);
          return;
        }
        setBarcode(data.item.barcode ?? "");
        setName(data.item.name ?? "");
        setScanExempt(!!data.item.scan_exempt);
        setHasExistingImage(!!data.item.has_image);
        setExistingImageStamp(new Date(data.item.updated_at).getTime());
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editItemId]);

  // 미리보기 URL 정리
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
      setNewImageFile(null);
      setNewImagePreview(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하만 업로드할 수 있습니다.");
      e.target.value = "";
      setNewImageFile(null);
      setNewImagePreview(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("barcode", barcode); // 빈 문자열 OK (서버에서 NULL 변환)
      formData.append("name", name);
      formData.append("scan_exempt", scanExempt ? "1" : "");
      if (newImageFile) {
        formData.append("image", newImageFile);
      } else if (isEdit && removeExisting) {
        formData.append("removeImage", "1");
      }

      const res = await fetch(
        isEdit ? `/api/warehouse/items/${editItemId}` : "/api/warehouse/items",
        { method: isEdit ? "PUT" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEdit ? "수정에 실패했습니다." : "품목 등록에 실패했습니다."));
        setLoading(false);
        return;
      }
      props.onSuccess();
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  if (fetching) {
    return <p className="text-zinc-500 py-6 text-center">로딩 중...</p>;
  }

  const showingNewPreview = !!newImagePreview;
  const showingExisting =
    isEdit && !showingNewPreview && !removeExisting && hasExistingImage;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          placeholder="바코드 미등록 (선택)"
          maxLength={100}
        />
        <p className="text-xs text-zinc-400 mt-1">{barcode.length} / 100자</p>
      </div>

      {/* 품목명 (필수) */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          품목명
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
          placeholder="품목명을 입력하세요"
          maxLength={200}
          required
        />
        <p className="text-xs text-zinc-400 mt-1">{name.length} / 200자</p>
      </div>

      {/* 스캔 불필요 */}
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={scanExempt}
          onChange={(e) => setScanExempt(e.target.checked)}
          className="mt-0.5 accent-zinc-900"
        />
        <span className="text-sm text-zinc-700">
          동봉(안내물)
          <span className="block text-xs text-zinc-400">
            동봉 인쇄물 표시용 배지. 검수 시 수동 챙김으로 확인합니다(제외 아님).
          </span>
        </span>
      </label>

      {/* 이미지 (선택) */}
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
              className="max-h-56 rounded-lg border border-zinc-200"
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
              src={`/api/warehouse/items/${editItemId}/image?v=${existingImageStamp}`}
              alt="현재 이미지"
              className="max-h-56 rounded-lg border border-zinc-200"
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

        {isEdit && removeExisting && !showingNewPreview && (
          <div className="mt-3 text-xs text-zinc-500">
            저장 시 기존 이미지가 제거됩니다.{" "}
            <button
              type="button"
              onClick={() => setRemoveExisting(false)}
              className="underline hover:text-zinc-900"
            >
              되돌리기
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="px-5 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
        >
          {loading ? (isEdit ? "수정 중..." : "등록 중...") : isEdit ? "수정 완료" : "등록"}
        </button>
      </div>
    </form>
  );
}
