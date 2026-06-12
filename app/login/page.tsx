"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

// useSearchParams 는 정적 프리렌더링을 막는다(Next.js 15 정책).
// 빌드 시 "missing-suspense-with-csr-bailout" 에러를 피하려면
// hook 을 호출하는 부분을 별도 컴포넌트로 분리해 <Suspense> 로 감싸야 한다.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 콜백이 없으면 옛 게시판(/) 대신 새 셸의 출고 대시보드로 보낸다.
  const callbackUrl = searchParams.get("callbackUrl") || "/warehouse";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      // Rate limit 차단 상태인지 확인해 친절한 메시지로 표시
      // (정확한 정책은 노출하지 않고 남은 시간만 안내)
      try {
        const statusRes = await fetch("/api/login-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        const statusData = await statusRes.json();
        if (
          statusData?.blocked &&
          typeof statusData.retryAfterSec === "number"
        ) {
          setError(
            `너무 많은 시도가 감지되었습니다. ${statusData.retryAfterSec}초 후 다시 시도해주세요.`
          );
          setLoading(false);
          return;
        }
      } catch {
        // 상태 조회 실패 시 일반 메시지로 폴백
      }
      setError("아이디 또는 비밀번호가 일치하지 않습니다.");
      setLoading(false);
      return;
    }

    // 로그인 성공 → 원래 가려던 페이지(callbackUrl) 또는 홈으로
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          아이디
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
          required
          autoComplete="username"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          비밀번호
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
          required
          autoComplete="current-password"
        />
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-50"
      >
        {loading ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}

function LoginFormFallback() {
  return (
    <div className="space-y-4">
      <div className="h-[68px]" />
      <div className="h-[68px]" />
      <div className="h-10 bg-zinc-100 rounded-lg animate-pulse" />
      <p className="text-center text-sm text-zinc-400">로딩 중...</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <h1 className="text-2xl font-bold text-center mb-8">로그인</h1>

        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>

        {/* Phase 2.5: 회원가입 차단으로 하단 링크 제거 */}
      </div>
    </div>
  );
}
