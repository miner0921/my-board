"use client";

import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────
// 공통 에러 폴백 화면. 모든 계층 error.tsx가 이걸 호출한다.
//   - 디자인/버튼은 여기 한 곳에서만 관리(누더기 방지).
//   - 문구는 계층별로 props(title/message)로 다르게 넘긴다.
//   - 단순 유지: DB/fetch/복잡 로직 없음. 받은 props만 렌더.
//   - 민감정보 비노출: raw error message/stack을 띄우지 않는다.
//     상세 로깅은 각 error.tsx의 console.error가 담당.
// ─────────────────────────────────────────────────────────────

type Props = {
  reset: () => void;
  title?: string;
  message?: string;
  showHome?: boolean;
};

export default function ErrorFallback({
  reset,
  title = "문제가 발생했습니다",
  message = "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요.",
  showHome = true,
}: Props) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center py-16 px-5">
      <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-center">
        <div className="flex justify-center mb-4">
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
            <AlertTriangle size={26} strokeWidth={1.75} className="text-red-500" />
          </span>
        </div>

        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-600 mt-1.5 leading-relaxed">{message}</p>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <button
            type="button"
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition"
          >
            <RefreshCw size={16} strokeWidth={1.75} />
            다시 시도
          </button>
          {showHome && (
            <button
              type="button"
              onClick={() => router.push("/warehouse")}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition"
            >
              <Home size={16} strokeWidth={1.75} />
              홈으로
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
