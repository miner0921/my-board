"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ScanLine,
  FileText,
  Package,
  Users,
  KeyRound,
  LogOut,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 다크 사이드바 본문 (브랜드 / 메뉴 / 하단 사용자영역).
// AppShell이 데스크탑·모바일 배치를 담당하고, 이 컴포넌트는 내용만 렌더.
//   - 현재 경로 강조: usePathname
//   - 사용자 정보(nickname, role)는 서버 layout에서 props로 주입
//   - onNavigate: 모바일에서 링크 클릭 시 오버레이 닫기
// ─────────────────────────────────────────────────────────────

type SidebarUser = {
  name: string;
  role: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof ScanLine;
};

const MAIN_NAV: NavItem[] = [
  { href: "/warehouse/invoices", label: "송장", icon: FileText },
  { href: "/warehouse/scan", label: "검수", icon: ScanLine },
  { href: "/warehouse/items", label: "품목", icon: Package },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "사용자", icon: Users },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar({
  user,
  onNavigate,
}: {
  user: SidebarUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  const roleLabel = user.role === "admin" ? "관리자 권한" : "작업자";

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive(pathname, href)
        ? "bg-zinc-700 text-white"
        : "text-zinc-300 hover:bg-zinc-700/50 hover:text-white"
    }`;

  return (
    <div className="flex h-full flex-col">
      {/* 브랜드 */}
      <Link
        href="/warehouse"
        onClick={onNavigate}
        className="block px-5 py-5 border-b border-zinc-700"
      >
        <p className="text-base font-medium text-white tracking-tight">
          MANWOL-BS
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">바코드 시스템</p>
      </Link>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={linkClass(item.href)}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}

        {/* 관리 섹션 — 관리자만 */}
        {user.role === "admin" && (
          <div className="pt-5">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              관리
            </p>
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={linkClass(item.href)}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* 하단: 사용자 + 계정 동작 */}
      <div className="border-t border-zinc-700 px-3 py-4">
        <div className="px-2 mb-3">
          <p className="text-sm font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{roleLabel}</p>
        </div>
        <Link
          href="/profile/password"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors"
        >
          <KeyRound size={15} strokeWidth={1.75} />
          비밀번호 변경
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors"
        >
          <LogOut size={15} strokeWidth={1.75} />
          로그아웃
        </button>
      </div>
    </div>
  );
}
