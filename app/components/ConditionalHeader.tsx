"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";

// ─────────────────────────────────────────────────────────────
// 게시판용 상단 헤더는 유지하되, 아래 경로에서는 렌더링하지 않는다.
// - 사이드바 셸 경로(/warehouse, /admin, /profile): 각 layout.tsx의
//   AppShell이 크롬을 담당하므로 이중 헤더 방지.
// - 인증 페이지(/login, /signup): 셸이 없어 헤더가 노출되는데,
//   로그인 직후 셸 경로로 client 전환 시 옛 헤더가 잠깐 깜빡이는 문제가
//   있어 아예 렌더하지 않는다.
// ─────────────────────────────────────────────────────────────

const HIDE_HEADER_PREFIXES = [
  "/warehouse",
  "/admin",
  "/profile",
  "/login",
  "/signup",
];

export default function ConditionalHeader() {
  const pathname = usePathname();
  const hideHeader = HIDE_HEADER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (hideHeader) return null;
  return <Header />;
}
