// 품목 썸네일 원자 — 작은 사각 이미지(또는 "이미지 없음" 회색 박스).
// 이미지 바이트는 별도 라우트에서 서빙하며 updated_at으로 캐시 무효화.
// 송장 상세 / 품목 목록 / 검수 화면이 모두 이 컴포넌트로 썸네일을 렌더한다.
// (presentational — 서버/클라이언트 양쪽에서 사용 가능)

type Size = "sm" | "md";

const SIZE_CLASS: Record<Size, string> = {
  sm: "w-14 h-14", // 56px — 가로 행/검수 카드
  md: "w-16 h-16", // 64px — 약간 큰 행
};

export default function ItemThumb({
  itemId,
  hasImage,
  updatedAt,
  name,
  size = "sm",
}: {
  itemId: number;
  hasImage: boolean;
  updatedAt: string;
  name: string;
  size?: Size;
}) {
  return (
    <div
      className={`${SIZE_CLASS[size]} shrink-0 rounded-md bg-zinc-50 border border-zinc-100 flex items-center justify-center overflow-hidden`}
    >
      {hasImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/warehouse/items/${itemId}/image?v=${new Date(updatedAt).getTime()}`}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[9px] leading-tight text-zinc-300 text-center px-0.5">
          이미지 없음
        </span>
      )}
    </div>
  );
}
