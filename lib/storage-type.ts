// 품목 보관온도 구분 (items.storage_type). NULL = 미지정.
export const STORAGE_TYPES = [
  { value: "room", label: "상온", color: "#f59e0b" },
  { value: "chilled", label: "냉장", color: "#3b82f6" },
  { value: "frozen", label: "냉동", color: "#8b5cf6" },
] as const;

export type StorageType = (typeof STORAGE_TYPES)[number]["value"];

export function parseStorageType(raw: unknown): StorageType | null {
  const v = String(raw ?? "").trim();
  return STORAGE_TYPES.some((t) => t.value === v) ? (v as StorageType) : null;
}

export function storageLabel(v: string | null | undefined): string {
  return STORAGE_TYPES.find((t) => t.value === v)?.label ?? "미지정";
}
