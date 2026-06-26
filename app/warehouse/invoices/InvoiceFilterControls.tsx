"use client";

// 송장 목록 필터(분류 + 날짜 범위) — 즉시 반영.
//   · 검색/필터 GET 폼 안에서 동작. 값 변경 시 폼을 즉시 제출(form.requestSubmit()).
//   · controlled(value=searchParams 파생값) → 초기화 navigation 후 SSR이 새 값을
//     주입하면 표시도 따라간다(uncontrolled defaultValue의 초기화 미반영 버그 해결).
//   · 검색어(q)만 버튼/엔터로 제출하고, 분류·날짜는 여기서 즉시 제출한다.
export default function InvoiceFilterControls({
  customerType,
  from,
  to,
}: {
  customerType: string;
  from: string;
  to: string;
}) {
  const submit = (el: HTMLElement) => el.closest("form")?.requestSubmit();

  const selectClass =
    "px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white cursor-pointer hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900";
  const dateClass =
    "px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900";

  return (
    <>
      <select
        name="type"
        value={customerType}
        onChange={(e) => submit(e.currentTarget)}
        aria-label="분류"
        className={selectClass}
      >
        <option value="all">분류: 전체</option>
        <option value="business">사업자</option>
        <option value="individual">개인</option>
        <option value="retail">소매</option>
        <option value="none">미분류</option>
      </select>
      <input
        type="date"
        name="from"
        value={from}
        onChange={(e) => submit(e.currentTarget)}
        aria-label="시작일"
        className={dateClass}
      />
      <span className="self-center text-zinc-400 text-sm">~</span>
      <input
        type="date"
        name="to"
        value={to}
        onChange={(e) => submit(e.currentTarget)}
        aria-label="종료일"
        className={dateClass}
      />
    </>
  );
}
