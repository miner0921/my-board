import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    // 1. 클라이언트가 보낸 데이터 받기
    const { username, password, nickname } = await request.json();

    // 2. 입력값 검증
    if (!username || !password || !nickname) {
      return NextResponse.json(
        { error: "모든 항목을 입력해주세요." },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 20) {
      return NextResponse.json(
        { error: "아이디는 3~20자여야 합니다." },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: "비밀번호는 4자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    // 3. 중복 아이디 체크
    const existing = await query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "이미 사용 중인 아이디입니다." },
        { status: 409 }
      );
    }

    // 4. 비밀번호 해시 (절대 평문으로 저장하지 않음!)
    // saltRounds = 10: 해시 강도. 숫자가 클수록 안전하지만 느려짐.
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. DB에 사용자 저장
    const result = await query(
      `INSERT INTO users (username, password, nickname)
       VALUES ($1, $2, $3)
       RETURNING id, username, nickname`,
      [username, hashedPassword, nickname]
    );

    return NextResponse.json(
      { user: result.rows[0], message: "회원가입 성공!" },
      { status: 201 }
    );
  } catch (error) {
    console.error("회원가입 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}