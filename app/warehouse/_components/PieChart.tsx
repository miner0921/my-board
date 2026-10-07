// 원형그래프 (conic-gradient, 의존성 없음). 서버 컴포넌트에서 그대로 렌더.
type Slice = { label: string; value: number; color: string };

export default function PieChart({ title, slices }: { title: string; slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const from = (acc / total) * 360;
      acc += s.value;
      return `${s.color} ${from}deg ${(acc / total) * 360}deg`;
    });

  return (
    <div className="p-5 bg-white border border-zinc-200 rounded-xl">
      <h3 className="font-semibold text-zinc-900 mb-4">{title}</h3>
      <div className="flex items-center gap-6">
        <div
          className="w-32 h-32 rounded-full shrink-0 relative"
          style={{ background: total ? `conic-gradient(${stops.join(", ")})` : "#e4e4e7" }}
        >
          <div className="absolute inset-6 bg-white rounded-full flex flex-col items-center justify-center">
            <span className="text-[10px] text-zinc-400">합계</span>
            <span className="text-sm font-bold text-zinc-900">{total.toLocaleString()}</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-sm min-w-0">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-zinc-700">{s.label}</span>
              <span className="text-zinc-900 font-medium tabular-nums">{s.value.toLocaleString()}</span>
              <span className="text-xs text-zinc-400">
                {total ? `${Math.round((s.value / total) * 100)}%` : "-"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
