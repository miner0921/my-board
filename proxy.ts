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

// ──────────────────────────────────────
// 출고시스템 보호: /warehouse/* 와 /api/warehouse/*
// ──────────────────────────────────────
function isWarehousePage(pathname: string) {
  return pathname === "/warehouse" || pathname.startsWith("/warehouse/");
}

function isWarehouseApi(pathname: string) {
  return pathname.startsWith("/api/warehouse/");
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // 1) 출고시스템 API: 비로그인이면 401 JSON
  if (isWarehouseApi(pathname) && !isLoggedIn) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  // 2) 출고시스템 페이지: 비로그인이면 /login으로 리다이렉트 (callbackUrl 보존)
  if (isWarehousePage(pathname) && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3) 게시판 보호 경로: 비로그인이면 /login으로 리다이렉트
  const isPostsProtected = POSTS_PROTECTED.some((p) => p.test(pathname));
  if (isPostsProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4) 이미 로그인했는데 /login 또는 /signup 가면 메인으로
  const isAuthRoute = AUTH_ROUTES.some((p) => p.test(pathname));
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // 정적 파일과 favicon은 제외, 나머지 모두 (api 포함)
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};