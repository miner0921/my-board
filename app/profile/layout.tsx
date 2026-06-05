import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";

// 계정 구간 셸 (비밀번호 변경 등).
export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell
      user={{
        name: session.user.name ?? "사용자",
        role: (session.user as { role?: string }).role ?? "user",
      }}
    >
      {children}
    </AppShell>
  );
}
