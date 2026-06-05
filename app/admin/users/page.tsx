import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { KeyRound } from "lucide-react";
import AddUserButton from "./AddUserButton";
import UserActions from "./UserActions";

type UserRow = {
  id: number;
  username: string;
  nickname: string;
  role: "user" | "admin";
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  created_by_name: string | null;
};

function formatDate(date: string) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const role = (session.user as { role?: string }).role ?? "user";
  if (role !== "admin") redirect("/warehouse");

  const myId = Number(session.user.id);

  const result = await query(
    `SELECT u.id, u.username, u.nickname, u.role, u.is_active,
            u.must_change_password, u.created_at,
            c.nickname AS created_by_name
       FROM users u
       LEFT JOIN users c ON u.created_by = c.id
      ORDER BY u.is_active DESC, u.created_at DESC, u.id DESC`
  );
  const users: UserRow[] = result.rows;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-sm text-zinc-500">
          계정 추가, 권한 변경, 활성/비활성을 관리합니다
        </p>
        <AddUserButton />
      </div>

      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-600">
          <div className="col-span-2">아이디</div>
          <div className="col-span-2">이름</div>
          <div className="col-span-1">권한</div>
          <div className="col-span-1">상태</div>
          <div className="col-span-2">생성일</div>
          <div className="col-span-2">생성자</div>
          <div className="col-span-2">액션</div>
        </div>

        {users.map((u) => {
          const isSelf = u.id === myId;
          return (
            <div
              key={u.id}
              className={`block sm:grid sm:grid-cols-12 gap-3 px-4 py-3 border-b border-zinc-100 last:border-b-0 text-sm ${
                !u.is_active ? "bg-zinc-50/60 text-zinc-500" : ""
              }`}
            >
              <div className="sm:col-span-2 font-mono text-zinc-900">
                {u.username}
                {u.must_change_password && (
                  <span
                    className="ml-1 inline-flex align-middle text-amber-600"
                    title="첫 로그인 시 비밀번호 변경 필요"
                  >
                    <KeyRound size={13} strokeWidth={1.75} />
                  </span>
                )}
              </div>
              <div className="sm:col-span-2 text-zinc-700 truncate">
                {u.nickname}
              </div>
              <div className="sm:col-span-1">
                {u.role === "admin" ? (
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200">
                    관리자
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                    일반
                  </span>
                )}
              </div>
              <div className="sm:col-span-1">
                {u.is_active ? (
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
                    활성
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
                    비활성
                  </span>
                )}
              </div>
              <div className="sm:col-span-2 text-zinc-500 text-xs">
                {formatDate(u.created_at)}
              </div>
              <div className="sm:col-span-2 text-zinc-500 text-xs truncate">
                {u.created_by_name ?? <span className="text-zinc-300">-</span>}
              </div>
              <div className="sm:col-span-2">
                <UserActions
                  userId={u.id}
                  role={u.role}
                  isActive={u.is_active}
                  isSelf={isSelf}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
