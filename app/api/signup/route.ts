import { NextResponse } from "next/server";

// Phase 2.5 부터 회원가입은 비활성화되었습니다.
// 새 사용자는 관리자가 DB에 직접 INSERT 합니다.
// 절차: migrations/003_first_admin.sql 의 주석 참고.
export async function POST() {
  return NextResponse.json(
    { error: "회원가입이 닫혀 있습니다. 관리자에게 문의해주세요." },
    { status: 403 }
  );
}
