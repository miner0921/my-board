import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";

// =====================================================
// 임시 마스킹 (Phase 4-A-3에서 lib/mask.ts 로 추출 예정)
// 목록 페이지와 동일 정책. 추출 시 한 곳으로 합침.
// =====================================================
function maskName(name: string | null | undefined): string {
  if (!name) return "-";
  const t = name.trim();
  if (t.length === 0) return "-";
  if (t.length === 1) return t;
  return t[0] + "○".repeat(t.length - 1);
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  const prefix = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${prefix}-****-${tail}`;
}

function maskAddress(addr: string | null | undefined): string {
  if (!addr) return "-";
  const t = addr.trim();
  if (!t) return "-";
  const tokens = t.split(/\s+/);
  // 시/구까지 (보통 첫 3토큰: "경기도 수원시 영통구" 또는 첫 2토큰: "서울시 강남구")
  if (tokens.length <= 3) return t;
  return tokens.slice(0, 3).join(" ") + " ***";
}

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
  created_at: string;
  completed_at: string | null;
  created_by_name: string | null;
  completed_by_name: string | null;
  total_qty: number;
  scanned_qty: number;
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

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const result = await query(
    `SELECT
       i.id, i.invoice_no, i.order_no, i.status,
       i.recipient_name, i.recipient_phone, i.recipient_address,
       i.recipient_postal_code, i.delivery_note, i.sender_name,
       i.raw_product_name,
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
  );

  if (result.rows.length === 0) notFound();
  const invoice: Invoice = result.rows[0];

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
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">송장번호</p>
            <h1 className="text-xl font-bold font-mono text-zinc-900">
              {invoice.invoice_no}
            </h1>
          </div>
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

        {/* 메타 */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm pb-4 border-b border-zinc-100">
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">주문번호</dt>
            <dd className="font-mono text-zinc-800">
              {invoice.order_no ?? <span className="text-zinc-300">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">진행률</dt>
            <dd className="text-zinc-800">
              <span className="font-semibold">{invoice.scanned_qty}</span>
              <span className="text-zinc-400"> / </span>
              <span>{invoice.total_qty}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 mb-0.5">송하인</dt>
            <dd className="text-zinc-800">
              {invoice.sender_name ?? <span className="text-zinc-300">-</span>}
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
            <div className="sm:col-span-2">
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

        {/* 수령인 (마스킹) */}
        <div className="pt-4">
          <p className="text-xs text-zinc-500 mb-2">수령인 (개인정보 보호 표시)</p>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">성명</dt>
              <dd className="text-zinc-800">{maskName(invoice.recipient_name)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">전화</dt>
              <dd className="text-zinc-800 font-mono text-xs">
                {maskPhone(invoice.recipient_phone)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">우편번호</dt>
              <dd className="text-zinc-800 font-mono text-xs">
                {invoice.recipient_postal_code ?? (
                  <span className="text-zinc-300">-</span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs text-zinc-500 mb-0.5">주소</dt>
              <dd className="text-zinc-800 text-xs">
                {maskAddress(invoice.recipient_address)}
              </dd>
            </div>
            {invoice.delivery_note && (
              <div className="sm:col-span-3">
                <dt className="text-xs text-zinc-500 mb-0.5">배송메시지</dt>
                <dd className="text-zinc-600 text-xs whitespace-pre-wrap">
                  {invoice.delivery_note}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </article>

      {/* 품목 목록 placeholder */}
      <div className="mt-6 border border-dashed border-zinc-300 rounded-lg p-8 text-center text-zinc-500">
        <p className="text-sm mb-1">품목 목록 / 스캔 진입 / 매칭 결과</p>
        <p className="text-xs text-zinc-400">
          Phase 4-A-3 에서 완성됩니다.
        </p>
      </div>

      {/* 원본 상품명 (디버깅/감사용 - 작게) */}
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
