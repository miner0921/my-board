"use client";

import { useState } from "react";

// 서버에서 미리 마스킹해 둔 값들. 페이지 첫 로드 시 평문은 클라이언트로
// 절대 내려가지 않는다. 사용자가 "전체 보기"를 누른 순간에만 서버에
// POST 요청을 보내 평문을 받아온다. 받아온 평문은 컴포넌트 state에 캐시되어
// 그 후 토글은 API 호출 없이 표시만 전환한다(감사 로그도 1회만 남음).
type Props = {
  invoiceId: number;
  maskedName: string;
  maskedPhone: string;
  maskedAddress: string;
  postalCode: string | null;
  deliveryNote: string | null;
};

type Plain = {
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  recipient_postal_code: string | null;
};

export default function RecipientBlock({
  invoiceId,
  maskedName,
  maskedPhone,
  maskedAddress,
  postalCode,
  deliveryNote,
}: Props) {
  const [plain, setPlain] = useState<Plain | null>(null);
  const [showPlain, setShowPlain] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleToggle = async () => {
    setError("");

    // 이미 평문을 받아왔으면 API 재호출 없이 토글만
    if (plain) {
      setShowPlain((v) => !v);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/warehouse/invoices/${invoiceId}/view-full`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "조회에 실패했습니다.");
        return;
      }
      setPlain(data.recipient);
      setShowPlain(true);
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const displayName = showPlain && plain ? plain.recipient_name ?? "-" : maskedName;
  const displayPhone =
    showPlain && plain ? plain.recipient_phone ?? "-" : maskedPhone;
  const displayAddress =
    showPlain && plain ? plain.recipient_address ?? "-" : maskedAddress;
  const displayPostal =
    showPlain && plain
      ? plain.recipient_postal_code ?? "-"
      : postalCode ?? "-";

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500">
          수령인{" "}
          {showPlain ? (
            <span className="text-red-600">(평문 표시 중)</span>
          ) : (
            <span>(개인정보 보호 표시)</span>
          )}
        </p>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className="text-xs px-2.5 py-1 border border-zinc-300 rounded hover:bg-zinc-50 transition disabled:opacity-50"
        >
          {loading
            ? "확인 중..."
            : showPlain
              ? "🙈 마스킹 복귀"
              : "👁 전체 보기"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-zinc-500 mb-0.5">성명</dt>
          <dd className="text-zinc-800">{displayName}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 mb-0.5">전화</dt>
          <dd className="text-zinc-800 font-mono text-xs">{displayPhone}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 mb-0.5">우편번호</dt>
          <dd className="text-zinc-800 font-mono text-xs">{displayPostal}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-xs text-zinc-500 mb-0.5">주소</dt>
          <dd className="text-zinc-800 text-xs">{displayAddress}</dd>
        </div>
        {deliveryNote && (
          <div className="sm:col-span-3">
            <dt className="text-xs text-zinc-500 mb-0.5">배송메시지</dt>
            <dd className="text-zinc-600 text-xs whitespace-pre-wrap">
              {deliveryNote}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
