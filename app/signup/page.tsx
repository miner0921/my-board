import Link from "next/link";

// Phase 2.5: 회원가입 폼 → 안내 페이지로 교체
export default function SignupClosedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
        <h1 className="text-xl font-bold mb-3">회원가입이 닫혀 있습니다</h1>
        <p className="text-sm text-zinc-600 mb-6">
          회원가입은 관리자에게 문의해주세요.
        </p>
        <Link
          href="/login"
          className="inline-block px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
        >
          로그인 페이지로
        </Link>
      </div>
    </div>
  );
}
