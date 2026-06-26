"use client";

// 송장 상태 필터 드롭다운 — 즉시 반영(분류/날짜와 동일 패턴).
//   · 탭별로 옵션이 달라 options를 주입받는다(완료=완료/부분완료, 대기=대기/검수중).
//   · controlled(value=searchParams 파생) → 초기화/탭 전환 시 표시 동기화.
//   · name="status" 로 폼에 실려 page.tsx가 statusFilter로 읽는다.
export default function StatusFilterSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      name="status"
      value={value}
      onChange={(e) => e.currentTarget.closest("form")?.requestSubmit()}
      aria-label="상태"
      className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white cursor-pointer hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
