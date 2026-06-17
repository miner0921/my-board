// 허용 이미지 MIME 타입
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// 5MB 제한
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// 10MB 제한 (엑셀 — 발주서/송장)
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;

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

// 업로드된 엑셀(.xlsx) 파일 검증 + Buffer 반환.
// MIME은 브라우저별로 부정확해서 확장자(.xlsx)와 크기로만 1차 검증하고,
// 실제 파싱 단계에서 xlsx 라이브러리가 한 번 더 거른다.
export async function readUploadedXlsx(file: File): Promise<ValidationResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "엑셀 파일이 비어있습니다." };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "엑셀(.xlsx) 파일만 업로드할 수 있습니다." };
  }
  if (file.size > MAX_XLSX_BYTES) {
    return { ok: false, error: "엑셀 파일은 10MB 이하만 업로드할 수 있습니다." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, buffer, mime: file.type };
}

// 업로드된 스프레드시트(.xlsx 또는 .csv) 검증 + Buffer 반환.
// 품목 대량 등록용. xlsx 라이브러리가 두 형식을 모두 파싱한다.
export async function readUploadedSpreadsheet(
  file: File
): Promise<ValidationResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일이 비어있습니다." };
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
    return {
      ok: false,
      error: "엑셀(.xlsx) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.",
    };
  }
  if (file.size > MAX_XLSX_BYTES) {
    return { ok: false, error: "파일은 10MB 이하만 업로드할 수 있습니다." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, buffer, mime: file.type };
}
