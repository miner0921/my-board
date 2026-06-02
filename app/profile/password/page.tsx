"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

// 비밀번호 변경 페이지.
//   - 로그인 사용자 모두 접근 가능.
//   - must_change_password=true 면 안내 배너 표시 + 다른 경로는 미들웨어가 차단.
//   - 변경 성공 시 useSession().update()로 세션 갱신 → must_change_password=false.
export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const currentRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  if (status === "loading") {
    return (
      <main className="max-w-md mx-auto px-6 py-8 text-sm text-zinc-500">
        로딩 중...
      </main>
    );
  }
  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const mustChange =
    (session?.user as { mustChangePassword?: boolean } | undefined)
      ?.mustChangePassword === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (next !== confirmPw) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (next === current) {
      setError("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "변경에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      // 세션 must_change_password=false 로 갱신 → 미들웨어 차단 해제
      await update({ mustChangePassword: false });
      setSuccess(true);
      setSubmitting(false);
      // 첫 로그인 케이스: 1.5초 후 메인으로 이동
      setTimeout(() => {
        router.push("/warehouse");
      }, 1500);
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-6 py-8">
      {!mustChange && (
        <Link
          href="/warehouse"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← 대시보드
        </Link>
      )}

      <h1 className="text-2xl font-bold text-zinc-900 mt-2 mb-6">
        비밀번호 변경
      </h1>

      {mustChange && (
        <div className="mb-5 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-900">
          🔒 임시 비밀번호로 로그인했습니다.
          <br />
          <span className="text-xs text-amber-800">
            새 비밀번호를 설정해야 다른 기능을 사용할 수 있습니다.
          </span>
        </div>
      )}

      {success ? (
        <div className="p-4 bg-green-50 border border-green-300 rounded-lg text-sm text-green-800">
          ✅ 비밀번호가 변경되었습니다. 잠시 후 이동합니다...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="current-pw"
              className="block text-xs text-zinc-500 mb-1"
            >
              현재 비밀번호
            </label>
            <input
              ref={currentRef}
              id="current-pw"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={submitting}
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
            />
          </div>
          <div>
            <label
              htmlFor="new-pw"
              className="block text-xs text-zinc-500 mb-1"
            >
              새 비밀번호 (8자 이상, 영문+숫자 포함)
            </label>
            <input
              id="new-pw"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
            />
          </div>
          <div>
            <label
              htmlFor="confirm-pw"
              className="block text-xs text-zinc-500 mb-1"
            >
              새 비밀번호 확인
            </label>
            <input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              current.length === 0 ||
              next.length === 0 ||
              confirmPw.length === 0
            }
            className="w-full py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            {submitting ? "변경 중..." : "변경"}
          </button>
        </form>
      )}
    </main>
  );
}
