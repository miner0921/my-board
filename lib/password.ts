import bcrypt from "bcryptjs";

// 비밀번호 관련 헬퍼.
// - generateTempPassword: 관리자가 사용자 추가 시 화면에 1회 표시할 임시 비번
// - validateNewPassword: 사용자가 직접 입력하는 새 비번 검증 (8자 이상, 영문+숫자)
// - hashPassword / verifyPassword: bcrypt 래퍼

// 혼동되는 문자(0/O/o, 1/l/I) 제외한 안전한 문자셋
const SAFE_LETTERS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I/O 제외
const SAFE_LETTERS_LOWER = "abcdefghjkmnpqrstuvwxyz"; // i/l 제외
const SAFE_DIGITS = "23456789"; // 0/1 제외
const SAFE_LETTERS = SAFE_LETTERS_UPPER + SAFE_LETTERS_LOWER;
const SAFE_ALL = SAFE_LETTERS + SAFE_DIGITS;

const TEMP_LENGTH = 10;
const NEW_PW_MIN = 8;
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /\d/;

function randomFrom(pool: string): string {
  // crypto.getRandomValues 가 가능한 환경(서버 Node 18+)에서는 우선 사용
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return pool[buf[0] % pool.length];
  }
  // 폴백
  return pool[Math.floor(Math.random() * pool.length)];
}

// 10자 임시 비번. 영문 1자 + 숫자 1자 보장 + 나머지 무작위 + 셔플.
export function generateTempPassword(): string {
  const chars: string[] = [
    randomFrom(SAFE_LETTERS),
    randomFrom(SAFE_DIGITS),
  ];
  while (chars.length < TEMP_LENGTH) {
    chars.push(randomFrom(SAFE_ALL));
  }
  // Fisher-Yates 셔플 — 영문/숫자 위치 고정 방지
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export type NewPasswordValidation =
  | { ok: true }
  | { ok: false; error: string };

// 사용자 입력 새 비번 검증: 8자 이상 + 영문 1자 + 숫자 1자.
// Phase 6 정책 — 기존 password-policy.ts(특수문자 강제)와는 별개.
export function validateNewPassword(plain: unknown): NewPasswordValidation {
  if (typeof plain !== "string" || plain.length < NEW_PW_MIN) {
    return {
      ok: false,
      error: `비밀번호는 ${NEW_PW_MIN}자 이상이어야 합니다.`,
    };
  }
  if (!HAS_LETTER.test(plain)) {
    return {
      ok: false,
      error: "비밀번호에 영문자가 1자 이상 포함되어야 합니다.",
    };
  }
  if (!HAS_DIGIT.test(plain)) {
    return {
      ok: false,
      error: "비밀번호에 숫자가 1자 이상 포함되어야 합니다.",
    };
  }
  return { ok: true };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
