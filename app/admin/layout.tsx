import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";

// 관리 구간 셸. 관리자 여부는 각 페이지/미들웨어에서 추가 검증.
export default async function AdminLayout({
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
