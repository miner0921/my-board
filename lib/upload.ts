// 허용 이미지 MIME 타입
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// 5MB 제한
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ValidationResult =
  | { ok: true; buffer: Buffer; mime: string }
  | { ok: false; error: string };

// 업로드된 File을 검증하고 Buffer + MIME 반환 (DB에 BYTEA로 저장하기 위함)
export async function readUploadedImage(file: File): Promise<ValidationResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "이미지 파일이 비어있습니다." };
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      error: "JPG, PNG, GIF, WEBP 형식만 업로드할 수 있습니다.",
    };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "이미지는 5MB 이하만 업로드할 수 있습니다." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, buffer, mime: file.type };
}
