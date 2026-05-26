// 비밀번호 정책: 8자 이상, 영문/숫자/특수문자 각 1자 이상 포함.
// 현재 회원가입은 차단되어 있으나, 추후 비밀번호 변경 기능에서 이 헬퍼를 재사용합니다.

const MIN_LENGTH = 8;
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?\/\\|`~]/;

export type PasswordValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validatePassword(plain: unknown): PasswordValidation {
  if (typeof plain !== "string" || plain.length < MIN_LENGTH) {
    return {
      ok: false,
      error: `비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`,
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
  if (!HAS_SPECIAL.test(plain)) {
    return {
      ok: false,
      error: "비밀번호에 특수문자가 1자 이상 포함되어야 합니다.",
    };
  }
  return { ok: true };
}
