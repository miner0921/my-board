"use client";

// 품목 목록 필터 체크박스(바코드 없음 / 이미지 없음) — 즉시 반영.
//   · 검색/필터 GET 폼 안에서 동작. 토글 시 폼을 즉시 제출(form.requestSubmit()).
//   · controlled(checked=searchParams 파생값) → 초기화 navigation 후 표시도 따라감.
//   · 박스 테두리 없이 체크박스 + 라벨만(시각 정리).
export default function FilterCheckbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        value="1"
        checked={checked}
        onChange={(e) => e.currentTarget.closest("form")?.requestSubmit()}
        className="accent-zinc-900"
      />
      {label}
    </label>
  );
}
