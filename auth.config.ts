import type { NextAuthConfig } from "next-auth";

// 미들웨어용 가벼운 설정 (DB/bcrypt 접근 없음)
export default {
  providers: [],
  session: {
    strategy: "jwt",
    // 30분 절대 만료. updateAge 만큼 활동이 있으면 새 쿠키가 발급되어 만료 시점이 갱신됨.
    // → 사실상 "30분 활동 없으면 자동 로그아웃" 동작.
    maxAge: 30 * 60,
    updateAge: 5 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = (user as { username: string }).username;
        token.role = (user as { role?: string }).role ?? "user";
        token.mustChangePassword =
          (user as { mustChangePassword?: boolean }).mustChangePassword === true;
      }
      // 비번 변경 직후 session.update()로 mustChangePassword 갱신 가능하게
      if (trigger === "update" && session) {
        const next = session as {
          mustChangePassword?: boolean;
          role?: string;
        };
        if (typeof next.mustChangePassword === "boolean") {
          token.mustChangePassword = next.mustChangePassword;
        }
        if (typeof next.role === "string") {
          token.role = next.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        const su = session.user as {
          username?: string;
          role?: "user" | "admin";
          mustChangePassword?: boolean;
        };
        su.username = token.username as string;
        su.role = (token.role as "user" | "admin") ?? "user";
        su.mustChangePassword =
          (token as { mustChangePassword?: boolean }).mustChangePassword === true;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
