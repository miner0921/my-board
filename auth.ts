import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import authConfig from "./auth.config";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/audit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials, request) {
        const username = (credentials?.username as string) ?? "";
        const password = (credentials?.password as string) ?? "";
        const ip = request ? extractClientIp(request as Request) : null;
        const usernameForLog = username.length > 0 ? username : null;

        if (!username || !password) return null;

        // Rate limit: 차단 중이면 인증 시도조차 하지 않음
        const rl = await checkLoginRateLimit(usernameForLog, ip);
        if (!rl.allowed) {
          // 차단 중인 시도도 감사 차원에서 기록
          await recordLoginAttempt({ username: usernameForLog, ip, success: false });
          return null;
        }

        const result = await query(
          "SELECT * FROM users WHERE username = $1",
          [username]
        );
        const user = result.rows[0];

        if (!user) {
          await recordLoginAttempt({ username: usernameForLog, ip, success: false });
          return null;
        }

        // 비활성화 계정은 비번 검증 전에 차단.
        // 일반 실패와 구분하지 않고 동일하게 null 반환해 사용자 존재 정보 누출 방지.
        if (user.is_active === false) {
          await recordLoginAttempt({ username: usernameForLog, ip, success: false });
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          await recordLoginAttempt({ username: usernameForLog, ip, success: false });
          return null;
        }

        await recordLoginAttempt({ username: usernameForLog, ip, success: true });

        return {
          id: String(user.id),
          name: user.nickname,
          username: user.username,
          role: (user.role ?? "user") as "user" | "admin",
          mustChangePassword: user.must_change_password === true,
        };
      },
    }),
  ],
});
