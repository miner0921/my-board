"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";

// ─────────────────────────────────────────────────────────────
// 출고 시스템 전체 셸: 좌측 다크 사이드바 + 우측 밝은 메인 영역.
//   - 데스크탑(>=md): 사이드바 220px 고정, 메인 flex-1
//   - 모바일(<md): 사이드바 숨김, 상단 바 햄버거 → 전체화면 오버레이
//   - 상단 제목 블록: 경로→{crumb, title} 자동 매핑(TITLE_MAP).
//     동적 제목이 필요한 페이지는 crumb/title prop으로 override.
// ─────────────────────────────────────────────────────────────

type ShellUser = {
  name: string;
  role: string;
};

// 경로별 브레드크럼/제목. 정확 일치 우선, 없으면 prefix 매칭.
const TITLE_MAP: Record<string, { crumb: string; title: string }> = {
  "/warehouse": { crumb: "바코드 시스템", title: "대시보드" },
  "/warehouse/scan": { crumb: "", title: "출고 스캔" },
  "/warehouse/invoices": { crumb: "", title: "송장 관리" },
  "/warehouse/items": { crumb: "", title: "품목 관리" },
  "/warehouse/items/new": { crumb: "품목 관리", title: "품목 등록" },
  "/warehouse/items/bulk": { crumb: "품목 관리", title: "CSV 대량 등록" },
  "/warehouse/upload": { crumb: "송장 관리", title: "송장 업로드" },
  "/admin/users": { crumb: "관리", title: "사용자 관리" },
  "/profile/password": { crumb: "계정", title: "비밀번호 변경" },
};

// prefix 기반 매칭 (동적 세그먼트 포함 경로).
const PREFIX_MAP: { prefix: string; crumb: string; title: string }[] = [
  { prefix: "/warehouse/invoices/", crumb: "송장 관리", title: "송장 상세" },
  { prefix: "/warehouse/items/", crumb: "품목 관리", title: "품목 수정" },
];

function resolveHeader(pathname: string): { crumb: string; title: string } {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  for (const m of PREFIX_MAP) {
    if (pathname.startsWith(m.prefix)) {
      return { crumb: m.crumb, title: m.title };
    }
  }
  return { crumb: "바코드 시스템", title: "" };
}

export default function AppShell({
  user,
  children,
  crumb: crumbOverride,
  title: titleOverride,
}: {
  user: ShellUser;
  children: React.ReactNode;
  crumb?: string;
  title?: string;
}) {
  const pathname = usePathname();
  // 모바일 오버레이는 사이드바 링크 클릭 시 onNavigate에서 닫는다.
  const [mobileOpen, setMobileOpen] = useState(false);

  const resolved = resolveHeader(pathname);
  const crumb = crumbOverride ?? resolved.crumb;
  const title = titleOverride ?? resolved.title;

  return (
    <div className="min-h-screen bg-white md:flex">
      {/* 모바일 상단 바 */}
      <div className="md:hidden flex items-center gap-3 border-b border-zinc-200 px-4 h-14 sticky top-0 bg-white z-20">
        <button
          type="button"
          aria-label="메뉴 열기"
          onClick={() => setMobileOpen(true)}
          className="p-1.5 -ml-1.5 text-zinc-700 hover:text-zinc-900"
        >
          <Menu size={22} strokeWidth={1.75} />
        </button>
        <span className="text-sm font-medium text-zinc-900">MANWOL-BS</span>
      </div>

      {/* 모바일 백드롭 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 사이드바 — 데스크탑 정적 / 모바일 슬라이드 오버레이 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[220px] bg-zinc-800 transform transition-transform duration-200 md:sticky md:top-0 md:h-screen md:self-start md:translate-x-0 md:shrink-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* 모바일 닫기 버튼 */}
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute top-4 right-3 p-1.5 text-zinc-400 hover:text-white z-10"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
        <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* 메인 영역 */}
      <div className="flex-1 min-w-0">
        {/* 상단 제목 헤더 */}
        <header className="border-b border-zinc-100 px-5 sm:px-8 py-5">
          {crumb && (
            <p className="text-xs text-zinc-500">{crumb}</p>
          )}
          {title && (
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 mt-0.5">
              {title}
            </h1>
          )}
        </header>

        <div className="px-5 sm:px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
