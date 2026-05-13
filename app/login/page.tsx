"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // NextAuth의 signIn 함수로 로그인 시도
    // "credentials"는 auth.ts에서 설정한 Credentials Provider를 의미
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false, // 자동 리다이렉트 막고, 결과를 직접 처리
    });

    if (result?.error) {
      setError("아이디 또는 비밀번호가 일치하지 않습니다.");
      setLoading(false);
      return;
    }

    // 로그인 성공 → 메인 페이지로 이동
    router.push("/");
    router.refresh(); // 서버 컴포넌트의 세션 정보 새로고침
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <h1 className="text-2xl font-bold text-center mb-8">로그인</h1>

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
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-600 mt-6">
          계정이 없으신가요?{" "}
          <Link
            href="/signup"
            className="text-zinc-900 font-medium hover:underline"
          >
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}