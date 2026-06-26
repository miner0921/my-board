"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// 삭제 보기 ↔ 활성 송장 전환 버튼.
// 쿼리파라미터(deleted=1)만 바뀌는 이동은 loading.tsx 폴백이 안 떠서
// 전환이 느릴 때 "반응 없음"처럼 보였다 → useTransition의 isPending으로
// 처리 중 스피너 + 비활성화(연타 방지)만 입힌다. 이동 동작 자체는 동일.
export default function ViewToggleButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.push(href))}
      className={className}
    >
      {pending && (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
