import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// ──────────────────────────────────────
// 게시판 관련 보호 경로
// ──────────────────────────────────────
const POSTS_PROTECTED = [
  /^\/posts\/new$/,
  /^\/posts\/\d+\/edit$/,
];

// 로그인 상태에서 가면 안 되는 경로 (이미 로그인했는데 로그인 페이지 가는 등)
const AUTH_ROUTES = [
  /^\/login$/,
  /^\/signup$/,
];

// must_change_password=true 사용자가 예외적으로 접근 허용할 경로
// (비번 변경 자체 + 로그아웃)
const MUST_CHANGE_ALLOWED = [
  /^\/profile\/password$/,
  /^\/api\/profile\/password$/,
  /^\/api\/auth\//, // signOut 등
];

// ──────────────────────────────────────
// 출고시스템 / 관리자 보호
// ──────────────────────────────────────
function isWarehousePage(pathname: string) {
  return pathname === "/warehouse" || pathname.startsWith("/warehouse/");
}
function isWarehouseApi(pathname: string) {
  return pathname.startsWith("/api/warehouse/");
}
function isAdminPage(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
function isAdminApi(pathname: string) {
  return pathname.startsWith("/api/admin/");
}
function isProfileArea(pathname: string) {
  return (
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname.startsWith("/api/profile/")
  );
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = (req.auth?.user as { role?: string } | undefined)?.role ?? "user";
  const mustChange =
    (req.auth?.user as { mustChangePassword?: boolean } | undefined)
      ?.mustChangePassword === true;

  // 1) 출고시스템 API: 비로그인이면 401 JSON
  if (isWarehouseApi(pathname) && !isLoggedIn) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  // 1-b) 관리자 API: 비로그인 401, 일반사용자 403
  if (isAdminApi(pathname)) {
    if (!isLoggedIn) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    if (role !== "admin") {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }
  }

  // 2) 출고/관리자/프로필 페이지: 비로그인이면 /login 리다이렉트
  if (
    (isWarehousePage(pathname) || isAdminPage(pathname) || isProfileArea(pathname)) &&
    !isLoggedIn
  ) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2-b) 관리자 페이지에 일반 사용자가 들어오면 → /warehouse
  if (isAdminPage(pathname) && isLoggedIn && role !== "admin") {
    return NextResponse.redirect(new URL("/warehouse", req.nextUrl.origin));
  }

  // 3) 게시판 보호 경로
  const isPostsProtected = POSTS_PROTECTED.some((p) => p.test(pathname));
  if (isPostsProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4) 이미 로그인했는데 /login 또는 /signup → 메인
  const isAuthRoute = AUTH_ROUTES.some((p) => p.test(pathname));
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // 5) must_change_password=true: 비번 변경 화면 외 모두 차단
  if (isLoggedIn && mustChange) {
    const allowed = MUST_CHANGE_ALLOWED.some((p) => p.test(pathname));
    if (!allowed) {
      return NextResponse.redirect(
        new URL("/profile/password", req.nextUrl.origin)
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
