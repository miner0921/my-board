import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { maskName, maskPhone, maskAddress } from "@/lib/mask";
import RecipientBlock from "./RecipientBlock";

type Invoice = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  recipient_postal_code: string | null;
  delivery_note: string | null;
  sender_name: string | null;
  raw_product_name: string | null;
  customer_type: string | null;
  created_at: string;
  completed_at: string | null;
  created_by_name: string | null;
  completed_by_name: string | null;
  total_qty: number;
  scanned_qty: number;
};

type InvoiceItem = {
  invoice_item_id: number;
  item_id: number;
  quantity: number;
  scanned_count: number;
  display_name: string | null; // 송장 원본 (★(증정샘플)망고 등)
  name: string;                // 정규화 후 마스터 품목명
  barcode: string | null;
  has_image: boolean;
  updated_at: string;
};

function formatDate(date: string | null) {
  if (!date) return "-";
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// 발주서 시트별 customer_type 매핑 (마이그레이션 007 주석 참고)
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
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
      미분류
    </span>
  );
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const [invResult, itemsResult] = await Promise.all([
    query(
      `SELECT
         i.id, i.invoice_no, i.order_no, i.status,
         i.recipient_name, i.recipient_phone, i.recipient_address,
         i.recipient_postal_code, i.delivery_note, i.sender_name,
         i.raw_product_name, i.customer_type,
         i.created_at, i.completed_at,
         uc.nickname AS created_by_name,
         uo.nickname AS completed_by_name,
         COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
         COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
       FROM invoices i
       LEFT JOIN users uc          ON i.created_by   = uc.id
       LEFT JOIN users uo          ON i.completed_by = uo.id
       LEFT JOIN invoice_items ii  ON ii.invoice_id  = i.id
       WHERE i.id = $1
       GROUP BY i.id, uc.nickname, uo.nickname`,
      [id]
    ),
    // 품목 카드용 — image_data(BYTEA)는 SELECT 안 하고 has_image만
    query(
      `SELECT
         ii.id AS invoice_item_id,
         ii.item_id, ii.quantity, ii.scanned_count, ii.display_name,
         it.name, it.barcode, it.updated_at,
         (it.image_data IS NOT NULL) AS has_image
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id`,
      [id]
    ),
  ]);

  if (invResult.rows.length === 0) notFound();
  const invoice: Invoice = invResult.rows[0];
  const items: InvoiceItem[] = itemsResult.rows;

  const progressPct =
    invoice.total_qty > 0
      ? Math.round((invoice.scanned_qty / invoice.total_qty) * 100)
      : 0;

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <Link
        href="/warehouse/invoices"
        className="inline-block text-sm text-zinc-500 hover:text-zinc-900 mb-4"
      >
        ← 송장 목록
      </Link>

      {/* 기본 정보 */}
      <article className="border border-zinc-200 rounded-lg p-6 bg-white">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 mb-1">송장번호</p>
            <h1 className="text-xl font-bold font-mono text-zinc-900 break-all">
              {invoice.invoice_no}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {customerTypeBadge(invoice.customer_type)}
            {invoice.status === "completed" ? (
              <span className="px-3 py-1 text-sm rounded bg-green-50 text-green-700 border border-green-200">
                완료
              </span>
            ) : (
              <span className="px-3 py-1 text-sm rounded bg-amber-50 text-amber-700 border border-amber-200">
                대기
              </span>
            )}
          </div>
        </div>

        {/* 메타 */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm pb-4 border-b border-zinc-100">
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">주문번호</dt>
            <dd className="font-mono text-zinc-800">
              {invoice.order_no ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">송하인</dt>
            <dd className="text-zinc-800">
              {invoice.sender_name ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>

          {/* 진행률 (전폭) */}
          <div className="sm:col-span-2">
            <dt className="text-xs text-zinc-500 mb-1">진행률</dt>
            <dd>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
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
                <span className="text-xs text-zinc-600 whitespace-nowrap">
                  <span className="font-semibold text-zinc-900">
                    {invoice.scanned_qty}
                  </span>
                  <span className="text-zinc-400"> / </span>
                  <span>{invoice.total_qty}</span>
                  <span className="text-zinc-400 ml-1">({progressPct}%)</span>
                </span>
              </div>
            </dd>
          </div>

          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">등록</dt>
            <dd className="text-zinc-600 text-xs">
              {formatDate(invoice.created_at)}
              {invoice.created_by_name && (
                <span className="ml-1 text-zinc-400">
                  · {invoice.created_by_name}
                </span>
              )}
            </dd>
          </div>
          {invoice.completed_at && (
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">검수 완료</dt>
              <dd className="text-zinc-600 text-xs">
                {formatDate(invoice.completed_at)}
                {invoice.completed_by_name && (
                  <span className="ml-1 text-zinc-400">
                    · {invoice.completed_by_name}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {/* 수령인 (마스킹 + 전체 보기 토글) */}
        <RecipientBlock
          invoiceId={invoice.id}
          maskedName={maskName(invoice.recipient_name)}
          maskedPhone={maskPhone(invoice.recipient_phone)}
          maskedAddress={maskAddress(invoice.recipient_address)}
          postalCode={invoice.recipient_postal_code}
          deliveryNote={invoice.delivery_note}
        />
      </article>

      {/* 품목 목록 */}
      <section className="mt-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((it) => {
              const showOriginal =
                !!it.display_name && it.display_name !== it.name;
              const itemScanComplete =
                it.scanned_count >= it.quantity && it.quantity > 0;
              return (
                <div
                  key={it.invoice_item_id}
                  className="border border-zinc-200 rounded-lg overflow-hidden bg-white flex flex-col"
                >
                  {/* 썸네일 */}
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

                  <div className="p-3 flex-1 flex flex-col">
                    {/* 정규화된 마스터 품목명 */}
                    <h3 className="font-medium text-sm text-zinc-900 line-clamp-2 mb-1">
                      {it.name}
                    </h3>

                    {/* 원본명이 다르면 표시 */}
                    {showOriginal && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2">
                        ★{it.display_name}
                        <span className="mx-1">→</span>
                        {it.name}
                      </p>
                    )}

                    {/* 수량 + 스캔 진행 */}
                    <div className="text-xs text-zinc-700 mb-2 flex items-center gap-2">
                      <span className="font-medium">×{it.quantity}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          itemScanComplete
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-zinc-50 text-zinc-600 border-zinc-200"
                        }`}
                      >
                        스캔 {it.scanned_count}/{it.quantity}
                      </span>
                    </div>

                    {/* 바코드 */}
                    <div className="mt-auto">
                      {it.barcode ? (
                        <p className="font-mono text-[11px] text-zinc-600 truncate">
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

      {/* 검수 시작 (Phase 5 예고) */}
      <div className="mt-6">
        <button
          type="button"
          disabled
          title="Phase 5에서 활성화됩니다."
          className="w-full py-3 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
        >
          검수 시작 (준비 중)
        </button>
      </div>

      {/* 원본 상품명 (디버깅/감사용) */}
      {invoice.raw_product_name && (
        <details className="mt-4 text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-700">
            원본 상품명 문자열 (raw)
          </summary>
          <pre className="mt-2 p-3 bg-zinc-50 border border-zinc-200 rounded text-zinc-700 whitespace-pre-wrap break-all">
            {invoice.raw_product_name}
          </pre>
        </details>
      )}
    </main>
  );
}
