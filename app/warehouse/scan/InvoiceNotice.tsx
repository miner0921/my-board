// "송장 안내" — 관리자→작업자 소통 통로.
//   - 재개 사유(수동 재개 시 관리자가 입력)
//   - 관리자 메모(송장 상세에서 관리자가 입력)
// 둘 다 없으면 렌더하지 않는다(평소 공간 차지 X).

export default function InvoiceNotice({
  reopenReason,
  adminMemo,
}: {
  reopenReason: string | null;
  adminMemo: string | null;
}) {
  const reason = reopenReason?.trim() || "";
  const memo = adminMemo?.trim() || "";
  if (!reason && !memo) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
      <p className="text-[11px] font-medium text-amber-700">송장 안내</p>
      {reason && (
        <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">
          <span className="text-xs text-amber-600 mr-1.5">재개 사유</span>
          {reason}
        </p>
      )}
      {memo && (
        <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">
          <span className="text-xs text-amber-600 mr-1.5">메모</span>
          {memo}
        </p>
      )}
    </div>
  );
}
