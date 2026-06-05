"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  CheckCircle2,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";

type CreatedUser = {
  id: number;
  username: string;
  nickname: string;
  role: "user" | "admin";
};

type Result = {
  user: CreatedUser;
  temp_password: string;
};

// 사용자 추가 모달 + 임시 비번 표시 모달 (2단계).
// 한 컴포넌트에 통합: 입력 → 생성 → 결과 표시 → 확인 → 새로고침.
export default function AddUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "result">("input");

  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const usernameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && step === "input") {
      usernameRef.current?.focus();
    }
  }, [open, step]);

  // ESC = 취소 (결과 단계에선 ESC도 닫힘 + 새로고침)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting, step]);

  const handleClose = () => {
    if (submitting) return;
    const wasResult = step === "result";
    setOpen(false);
    setStep("input");
    setUsername("");
    setNickname("");
    setRole("user");
    setError("");
    setResult(null);
    setCopied(false);
    if (wasResult) {
      router.refresh();
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          nickname: nickname.trim(),
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "생성 실패");
        return;
      }
      setResult({ user: data.user, temp_password: data.temp_password });
      setStep("result");
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temp_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: 클립보드 사용 불가 환경 — 사용자가 직접 선택해서 복사
      setCopied(false);
    }
  };

  const canSubmit =
    username.trim().length > 0 && nickname.trim().length > 0 && !submitting;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium"
      >
        <Plus size={16} strokeWidth={2} />
        사용자 추가
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          {step === "input" && (
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                사용자 추가
              </h2>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    아이디 (영문/숫자/_ 3~30자)
                  </label>
                  <input
                    ref={usernameRef}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={submitting}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    이름 (닉네임)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                  />
                </div>
                <fieldset>
                  <legend className="block text-xs text-zinc-500 mb-1">
                    권한
                  </legend>
                  <div className="flex gap-2">
                    <label
                      className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition ${
                        role === "user"
                          ? "border-zinc-900 bg-zinc-50"
                          : "border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value="user"
                        checked={role === "user"}
                        onChange={() => setRole("user")}
                        disabled={submitting}
                      />
                      <span>일반</span>
                    </label>
                    <label
                      className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition ${
                        role === "admin"
                          ? "border-zinc-900 bg-zinc-50"
                          : "border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={role === "admin"}
                        onChange={() => setRole("admin")}
                        disabled={submitting}
                      />
                      <span>관리자</span>
                    </label>
                  </div>
                </fieldset>
              </div>

              {error && (
                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
                >
                  취소 (ESC)
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
                >
                  {submitting ? "생성 중..." : "생성"}
                </button>
              </div>
            </div>
          )}

          {step === "result" && result && (
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle2
                  size={28}
                  strokeWidth={1.75}
                  className="shrink-0 text-green-600 mt-0.5"
                />
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    사용자 생성 완료
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    임시 비밀번호는 다시 볼 수 없으니 지금 복사해서 사용자에게
                    전달하세요.
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div>
                  <dt className="text-[11px] text-zinc-500">아이디</dt>
                  <dd className="font-mono text-sm">{result.user.username}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-zinc-500">이름</dt>
                  <dd>{result.user.nickname}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-zinc-500">권한</dt>
                  <dd>{result.user.role === "admin" ? "관리자" : "일반"}</dd>
                </div>
              </dl>

              <div className="mb-4">
                <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                  <KeyRound size={13} strokeWidth={1.75} />
                  임시 비밀번호
                </p>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3">
                  <code className="flex-1 font-mono text-base text-zinc-900 break-all select-all">
                    {result.temp_password}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-amber-300 text-amber-800 rounded hover:bg-amber-100 transition whitespace-nowrap"
                  >
                    {copied ? (
                      <>
                        <Check size={13} strokeWidth={2} />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Copy size={13} strokeWidth={1.75} />
                        복사
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                  <AlertTriangle
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 mt-0.5"
                  />
                  <span>
                    이 비밀번호는 다시 볼 수 없습니다. 사용자가 로그인 후 반드시
                    비밀번호를 변경하게 됩니다.
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
              >
                확인
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
