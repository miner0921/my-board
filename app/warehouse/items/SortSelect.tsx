"use client";

// 품목 목록 정렬 드롭다운.
// 기존 검색/필터 GET 폼 안에 들어가며, 값 변경 시 폼을 즉시 제출해
// 검색어·체크박스 상태를 함께 유지한 채 정렬만 바꾼다.
// 옵션 key는 서버(page.tsx)의 SORT_OPTIONS와 반드시 일치해야 한다.
export default function SortSelect({ value }: { value: string }) {
  return (
    <select
      name="sort"
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      aria-label="정렬"
      className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white cursor-pointer hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
    >
      <option value="name">이름순 (가나다)</option>
      <option value="recent">등록순 (최신)</option>
      <option value="oldest">등록순 (오래된)</option>
      <option value="nobarcode">바코드 없는 순</option>
    </select>
  );
}
