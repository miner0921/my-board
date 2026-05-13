import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// 보호할 경로 패턴들
const PROTECTED_ROUTES = [
  /^\/posts\/new$/,
  /^\/posts\/\d+\/edit$/,
];

// 로그인 상태에서 가면 안 되는 경로
const AUTH_ROUTES = [
  /^\/login$/,
  /^\/signup$/,
];

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isProtected = PROTECTED_ROUTES.some((pattern) => pattern.test(pathname));
  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthRoute = AUTH_ROUTES.some((pattern) => pattern.test(pathname));
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};