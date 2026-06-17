"use client";

// 품목 카테고리 필터 드롭다운 (상품명 첫 괄호 = 카테고리).
// 기존 검색/필터 GET 폼 안에서 동작하며, 변경 시 폼을 즉시 제출.
export default function CategorySelect({
  value,
  categories,
}: {
  value: string;
  categories: string[];
}) {
  return (
    <select
      name="cat"
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      aria-label="카테고리"
      className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white cursor-pointer hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
    >
      <option value="">전체 카테고리</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__none__">카테고리 없음</option>
    </select>
  );
}
