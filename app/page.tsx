import { redirect } from "next/navigation";

// 루트(/)는 출고 대시보드로 보낸다.
// 비로그인 상태면 미들웨어(proxy.ts)가 /warehouse 접근을 /login으로 돌린다.
export default function Home() {
  redirect("/warehouse");
}
