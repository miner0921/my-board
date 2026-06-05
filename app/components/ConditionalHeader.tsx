"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";

// ─────────────────────────────────────────────────────────────
// 게시판용 상단 헤더는 유지하되, 사이드바 셸을 쓰는 경로
// (/warehouse, /admin, /profile)에서는 렌더링하지 않는다.
// 해당 경로들은 각 layout.tsx의 AppShell이 크롬을 담당하므로
// 이중 헤더를 방지하기 위함.
// ─────────────────────────────────────────────────────────────

const SHELL_PREFIXES = ["/warehouse", "/admin", "/profile"];

export default function ConditionalHeader() {
  const pathname = usePathname();
  const inShell = SHELL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (inShell) return null;
  return <Header />;
}
