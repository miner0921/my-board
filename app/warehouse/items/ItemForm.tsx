"use client";

import { useState, useEffect, useRef } from "react";
import { splitProductName, buildItemName } from "@/lib/product-name";
import { itemMatchKey } from "@/lib/resolve-item";

type Alias = { id: number; alias_name: string; normalized_alias: string };

// ─────────────────────────────────────────────────────────────
// 품목 등록/수정 공용 폼.
//   - mode="create": 새 품목 등록 (POST /api/warehouse/items)
//   - mode="edit":   기존 품목 수정 (GET 으로 초기값 로드 → PUT)
//   - 검증/이미지/API 호출 로직은 기존 new·edit 페이지 그대로.
//   - 모달 안에서 사용. 성공 시 onSuccess(), 취소 시 onCancel().
// ─────────────────────────────────────────────────────────────

type Props =
  | { mode: "create"; isAdmin?: boolean; onSuccess: () => void; onCancel: () => void }
  | {
      mode: "edit";
      itemId: number;
      isAdmin?: boolean;
      onSuccess: () => void;
      onCancel: () => void;
    };

export default function ItemForm(props: Props) {
  const isEdit = props.mode === "edit";
  const editItemId = props.mode === "edit" ? props.itemId : null;
  const isAdmin = props.isAdmin ?? false;
  // 작업자(비관리자) 수정 모드: 바코드·대표 이미지만 수정 가능.
  //   품목코드·구분·종류·동봉 입력은 비활성(기존값은 보이게). 서버(PUT)도 동일 제한.
  const workerEdit = isEdit && !isAdmin;

  const [productCode, setProductCode] = useState("");
  const [category, setCategory] = useState(""); // 구분
  const [kind, setKind] = useState(""); // 종류
  const [barcode, setBarcode] = useState("");
  const [scanExempt, setScanExempt] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  // 별칭(같은 취급 품명) — edit + 관리자에서만 사용
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);

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
        setProductCode(data.item.product_code ?? "");
        const cat = data.item.category ?? "";
        const knd = data.item.kind ?? "";
        // 구분·종류가 둘 다 비어있으면(송장 자동생성 품목) 품명에서 역산해 채움.
        // 컬럼에 값이 있으면(엑셀·개별 등록분) 그대로 사용. 저장은 항상 compose로 합침.
        if (!cat && !knd) {
          const split = splitProductName(data.item.name);
          setCategory(split.category);
          setKind(split.kind);
        } else {
          setCategory(cat);
          setKind(knd);
        }
        setBarcode(data.item.barcode ?? "");
        setScanExempt(!!data.item.scan_exempt);
        setAliases(data.aliases ?? []);
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

  const handleAddAlias = async () => {
    const alias = newAlias.trim();
    if (!alias || editItemId === null) return;
    setAliasError("");
    setAliasBusy(true);
    try {
      const res = await fetch(`/api/warehouse/items/${editItemId}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAliasError(data.error || "별칭 추가에 실패했습니다.");
        return;
      }
      setAliases((prev) => [...prev, data.alias]);
      setNewAlias("");
    } catch (err) {
      console.error(err);
      setAliasError("네트워크 오류가 발생했습니다.");
    } finally {
      setAliasBusy(false);
    }
  };

  const handleDeleteAlias = async (aliasId: number) => {
    if (editItemId === null) return;
    setAliasError("");
    try {
      const res = await fetch(
        `/api/warehouse/items/${editItemId}/aliases/${aliasId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAliasError(data.error || "별칭 삭제에 실패했습니다.");
        return;
      }
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
    } catch (err) {
      console.error(err);
      setAliasError("네트워크 오류가 발생했습니다.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("product_code", productCode); // 빈 문자열 OK (서버에서 NULL 변환)
      formData.append("category", category);
      formData.append("kind", kind);
      formData.append("barcode", barcode); // 빈 문자열 OK (서버에서 NULL 변환)
      // name(품명)은 서버에서 buildItemName(구분, 종류) = 정규화 품명으로 조합 — 여기서 보내지 않음
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
      {workerEdit && (
        <p className="px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
          작업자는 바코드·대표 이미지만 수정할 수 있습니다.
        </p>
      )}

      {/* 품목코드 (선택) */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          품목코드 <span className="text-zinc-400 text-xs">(선택)</span>
        </label>
        <input
          type="text"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          disabled={workerEdit}
          className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
          placeholder="예: TPBEV0004"
          maxLength={100}
        />
        <p className="text-xs text-zinc-400 mt-1">{productCode.length} / 100자</p>
      </div>

      {/* 구분 + 종류 → 품명 "(구분)종류" 로 조합 저장 */}
      <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            구분 <span className="text-zinc-400 text-xs">(선택)</span>
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={workerEdit}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
            placeholder="예: 1kg"
            maxLength={100}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            종류
          </label>
          <input
            type="text"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={workerEdit}
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
            placeholder="예: 악마초코"
            maxLength={200}
            required
          />
        </div>
      </div>
      {/* 조합 품명 미리보기 — 저장될 실제 품명(정규화형, 검수 매칭 키) */}
      <p className="text-xs text-zinc-500 -mt-1">
        저장 품명:{" "}
        <span className="font-medium text-zinc-700">
          {kind.trim() ? (
            buildItemName(category, kind)
          ) : (
            <span className="text-zinc-300">(종류 입력)</span>
          )}
        </span>
      </p>

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

      {/* 스캔 불필요 */}
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={scanExempt}
          onChange={(e) => setScanExempt(e.target.checked)}
          disabled={workerEdit}
          className="mt-0.5 accent-zinc-900 disabled:cursor-not-allowed"
        />
        <span className="text-sm text-zinc-700">
          동봉(안내물)
          <span className="block text-xs text-zinc-400">
            동봉 인쇄물 표시용 배지. 검수 시 수동 챙김으로 확인합니다(제외 아님).
          </span>
        </span>
      </label>

      {/* 별칭(같은 취급 품명) — 수정 + 관리자만 */}
      {isEdit && isAdmin && (
        <div className="border-t border-zinc-100 pt-4">
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            같은 취급 품명{" "}
            <span className="text-zinc-400 text-xs">(별칭 · 송장 매칭용)</span>
          </label>
          <p className="text-xs text-zinc-400 mb-2">
            송장에 이 품목의 변형 품명이 와도 같은 품목으로 인식합니다. 정규화하면
            품목 품명과 같아지는 변형, 다른 품목이 쓰는 품명은 등록할 수 없습니다.
          </p>

          {aliases.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mb-2">
              {aliases.map((a) => (
                <li
                  key={a.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-1 bg-zinc-100 rounded text-xs text-zinc-700"
                >
                  <span title={`매칭 키: ${a.normalized_alias}`}>
                    {a.alias_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteAlias(a.id)}
                    className="text-zinc-400 hover:text-red-600 leading-none px-1"
                    aria-label="별칭 삭제"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddAlias();
                }
              }}
              placeholder="예: 말차1키로"
              maxLength={200}
              className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <button
              type="button"
              onClick={handleAddAlias}
              disabled={aliasBusy || !newAlias.trim()}
              className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition disabled:opacity-40"
            >
              {aliasBusy ? "추가 중..." : "추가"}
            </button>
          </div>
          {newAlias.trim() && (
            <p className="text-xs text-zinc-400 mt-1">
              매칭 키:{" "}
              <span className="font-medium text-zinc-600">
                {itemMatchKey(newAlias) || "(빈 값)"}
              </span>
            </p>
          )}
          {aliasError && (
            <p className="text-xs text-red-600 mt-1">{aliasError}</p>
          )}
        </div>
      )}

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
