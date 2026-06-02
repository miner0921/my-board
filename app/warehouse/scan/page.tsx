"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type InvoiceLookup = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  status: string;
  sender_name: string | null;
  customer_type: string | null;
  delivery_note: string | null;
  recipient_postal_code: string | null;
  recipient_name_masked: string;
  recipient_phone_masked: string;
  recipient_address_masked: string;
  total_qty: number;
  scanned_qty: number;
};

type InvoiceItem = {
  invoice_item_id: number;
  item_id: number;
  quantity: number;
  scanned_count: number;
  display_name: string | null;
  name: string;
  barcode: string | null;
  has_image: boolean;
  updated_at: string;
};

function customerTypeBadge(type: string | null) {
  if (type === "business") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200">
        사업자
      </span>
    );
  }
  if (type === "individual") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
        개인
      </span>
    );
  }
  if (type === "retail") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700 border border-purple-200">
        소매
      </span>
    );
  }
  return null;
}

export default function ScanPage() {
  const [invoice, setInvoice] = useState<InvoiceLookup | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [invoiceInput, setInvoiceInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invoiceInputRef = useRef<HTMLInputElement | null>(null);

  // 입력란을 비우고 다음 frame(리렌더 후 disabled=false 반영)에 focus 복원.
  // USB 바코드 스캐너 흐름에서 다음 스캔이 곧바로 가능해야 하므로
  // 에러/취소 모든 경로에서 호출한다.
  const resetAndFocus = useCallback(() => {
    setInvoiceInput("");
    requestAnimationFrame(() => {
      invoiceInputRef.current?.focus();
    });
  }, []);

  // 초기 mount + 송장 변경 리셋 시 입력란에 자동 focus
  useEffect(() => {
    if (!invoice) invoiceInputRef.current?.focus();
  }, [invoice]);

  const handleLookup = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    // 같은 송장 재스캔: 조용히 무시
    if (invoice && invoice.invoice_no === value) {
      resetAndFocus();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/invoices/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_no: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "송장을 조회하지 못했습니다.");
        setLoading(false);
        resetAndFocus();
        return;
      }
      // 성공: scanning 트리로 전환되며 입력란 unmount → focus 불필요
      setInvoice(data.invoice);
      setItems(data.items);
      setInvoiceInput("");
      setLoading(false);
    } catch (e) {
      console.error(e);
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
      resetAndFocus();
    }
  };

  const handleInvoiceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLookup(invoiceInput);
    }
  };

  const handleReset = () => {
    // 5-B에서 진행률 > 0일 때 confirm 추가 예정
    setInvoice(null);
    setItems([]);
    setInvoiceInput("");
    setError("");
  };

  // ─────────────────────────────────────────────
  // waiting 상태
  // ─────────────────────────────────────────────
  if (!invoice) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/warehouse"
          className="inline-block text-sm text-zinc-500 hover:text-zinc-900 mb-4"
        >
          ← 대시보드
        </Link>

        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📦</div>
          <h1 className="text-2xl font-bold text-zinc-900">출고 검수</h1>
          <p className="text-sm text-zinc-500 mt-2">
            먼저 송장 바코드를 스캔하세요
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6">
          <label
            htmlFor="invoice-input"
            className="block text-xs text-zinc-500 mb-2"
          >
            송장 바코드
          </label>
          <input
            key="invoice-barcode-input"
            ref={invoiceInputRef}
            id="invoice-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={invoiceInput ?? ""}
            onChange={(e) => setInvoiceInput(e.target.value)}
            onKeyDown={handleInvoiceKeyDown}
            disabled={loading}
            placeholder="USB 스캐너로 자동 입력 또는 직접 입력 후 Enter"
            className="w-full text-lg sm:text-xl font-mono px-4 py-4 border-2 border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleLookup(invoiceInput)}
            disabled={loading || !invoiceInput.trim()}
            className="mt-3 w-full py-3 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            {loading ? "조회 중..." : "송장 조회"}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">⚠️ {error}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-400 text-center mt-6">
          💡 USB 바코드 스캐너가 자동으로 입력하고 Enter까지 처리합니다.
        </p>
      </main>
    );
  }

  // ─────────────────────────────────────────────
  // scanning 상태
  // ─────────────────────────────────────────────
  const progressPct =
    invoice.total_qty > 0
      ? Math.round((invoice.scanned_qty / invoice.total_qty) * 100)
      : 0;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* 상단 바: 송장 변경 + 송장번호 */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm px-3 py-1.5 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
        >
          ← 송장 변경
        </button>
        <div className="text-right min-w-0">
          <p className="text-[11px] text-zinc-500">송장번호</p>
          <p className="font-mono text-sm sm:text-base font-semibold text-zinc-900 truncate">
            {invoice.invoice_no}
          </p>
        </div>
      </div>

      {/* 송장 카드 */}
      <article className="border border-zinc-200 rounded-xl p-4 sm:p-5 bg-white mb-4">
        <div className="flex items-center gap-2 mb-3">
          {customerTypeBadge(invoice.customer_type)}
          <span className="px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">
            검수 중
          </span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-4">
          <div>
            <dt className="text-[11px] text-zinc-500">주문번호</dt>
            <dd className="font-mono text-xs text-zinc-800">
              {invoice.order_no ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-500">송하인</dt>
            <dd className="text-xs text-zinc-800">
              {invoice.sender_name ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-500">수령인</dt>
            <dd className="text-xs text-zinc-800">
              {invoice.recipient_name_masked}
              <span className="text-zinc-400 ml-1 font-mono">
                · {invoice.recipient_phone_masked}
              </span>
            </dd>
          </div>
        </dl>

        {/* 진행률 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-500">진행률</span>
            <span className="text-xs text-zinc-700">
              <span className="font-semibold text-zinc-900">
                {invoice.scanned_qty}
              </span>
              <span className="text-zinc-400"> / </span>
              <span>{invoice.total_qty}</span>
              <span className="text-zinc-400 ml-1">({progressPct}%)</span>
            </span>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                progressPct === 100
                  ? "bg-green-500"
                  : progressPct > 0
                    ? "bg-zinc-700"
                    : "bg-zinc-300"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </article>

      {/* 품목 스캔 입력란 (5-B에서 활성화) */}
      <div className="border-2 border-dashed border-zinc-300 rounded-xl p-4 sm:p-5 bg-zinc-50 mb-6">
        <label className="block text-xs text-zinc-500 mb-2">
          품목 바코드
        </label>
        <input
          key="item-barcode-input-placeholder"
          type="text"
          value=""
          readOnly
          disabled
          placeholder="Phase 5-B에서 활성화됩니다"
          className="w-full text-lg font-mono px-4 py-4 border-2 border-zinc-200 rounded-lg bg-white text-zinc-400 cursor-not-allowed"
        />
      </div>

      {/* 품목 목록 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-900">
            품목{" "}
            <span className="text-zinc-400 font-normal text-sm">
              ({items.length}건)
            </span>
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
            연결된 품목이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((it) => {
              const showOriginal =
                !!it.display_name && it.display_name !== it.name;
              const complete =
                it.scanned_count >= it.quantity && it.quantity > 0;
              return (
                <div
                  key={it.invoice_item_id}
                  className={`border rounded-lg overflow-hidden bg-white flex flex-col ${
                    complete ? "border-green-300" : "border-zinc-200"
                  }`}
                >
                  <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
                    {it.has_image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/warehouse/items/${it.item_id}/image?v=${new Date(it.updated_at).getTime()}`}
                        alt={it.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-zinc-300">이미지 없음</span>
                    )}
                  </div>

                  <div className="p-2.5 flex-1 flex flex-col">
                    <h3 className="font-medium text-sm text-zinc-900 line-clamp-2 mb-1">
                      {it.name}
                    </h3>

                    {showOriginal && (
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mb-1.5">
                        ★{it.display_name}
                      </p>
                    )}

                    <div className="text-xs text-zinc-700 mb-2 flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">×{it.quantity}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          complete
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-zinc-50 text-zinc-600 border-zinc-200"
                        }`}
                      >
                        {it.scanned_count}/{it.quantity}
                      </span>
                    </div>

                    <div className="mt-auto">
                      {it.barcode ? (
                        <p className="font-mono text-[10px] text-zinc-500 truncate">
                          {it.barcode}
                        </p>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px]">
                          바코드 미등록
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
