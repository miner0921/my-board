import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";

// 출고 시스템 전 구간에 사이드바 셸 적용. 사용자 정보는 서버에서 주입.
export default async function WarehouseLayout({
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
