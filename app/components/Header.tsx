"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/");
    router.refresh();
  };

  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* 왼쪽: 로고/사이트명 */}
        <Link href="/" className="text-xl font-bold text-zinc-900">
          📋 게시판
        </Link>

        {/* 오른쪽: 로그인 상태에 따라 다른 메뉴 */}
        <nav className="flex items-center gap-3">
          {status === "loading" ? (
            // 세션 로딩 중일 때
            <span className="text-sm text-zinc-400">로딩 중...</span>
          ) : session ? (
            // 로그인된 상태
            <>
              <span className="text-sm text-zinc-700">
                <span className="font-medium">{session.user?.name}</span>님
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
              >
                로그아웃
              </button>
            </>
          ) : (
            // 로그아웃 상태
            <>
              <Link
                href="/login"
                className="px-4 py-1.5 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="px-4 py-1.5 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition"
              >
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}