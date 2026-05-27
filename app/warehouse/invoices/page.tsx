import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { maskName, maskPhone } from "@/lib/mask";

type InvoiceRow = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  status: string;
  customer_type: string | null;
  created_at: string;
  total_qty: number;
  scanned_qty: number;
};

function formatDate(date: string) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// 발주서 시트별 customer_type 매핑 (마이그레이션 007 참고)
function customerTypeBadge(type: string | null) {
  if (type === "business") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-blue-50 text-blue-700 border border-blue-200">
        사업자
      </span>
    );
  }
  if (type === "individual") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-green-50 text-green-700 border border-green-200">
        개인
      </span>
    );
  }
  if (type === "retail") {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-purple-50 text-purple-700 border border-purple-200">
        소매
      </span>
    );
  }
  return (
    <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
      미분류
    </span>
  );
}

const ALLOWED_TYPES = new Set(["business", "individual", "retail", "none"]);

type PageProps = {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
};

export default async function InvoiceListPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const {
    q: qParam,
    status: statusParam,
    type: typeParam,
  } = await searchParams;
  const q = (qParam ?? "").trim();
  const status =
    statusParam === "pending" || statusParam === "completed"
      ? statusParam
      : "all";
  const customerType =
    typeParam && ALLOWED_TYPES.has(typeParam) ? typeParam : "all";
  const isFiltered = q !== "" || status !== "all" || customerType !== "all";

  // 동적 WHERE 구성
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(
      `(i.invoice_no ILIKE $${params.length} OR i.order_no ILIKE $${params.length})`
    );
  }
  if (status !== "all") {
    params.push(status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (customerType !== "all") {
    if (customerType === "none") {
      conditions.push(`i.customer_type IS NULL`);
    } else {
      params.push(customerType);
      conditions.push(`i.customer_type = $${params.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       i.id, i.invoice_no, i.order_no,
       i.recipient_name, i.recipient_phone,
       i.status, i.customer_type, i.created_at,
       COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
       COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
     FROM invoices i
     LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
     ${where}
     GROUP BY i.id
     ORDER BY i.created_at DESC`,
    params
  );

  const invoices: InvoiceRow[] = result.rows;

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <Link
          href="/warehouse"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← 바코드 관리
        </Link>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">송장 관리</h1>
            <p className="text-sm text-zinc-500 mt-1">
              발주서와 송장 파일을 업로드하면 자동으로 등록됩니다
            </p>
          </div>
          <Link
            href="/warehouse/upload"
            className="px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition font-medium self-start sm:self-auto"
          >
            + 송장 업로드
          </Link>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <form
        action="/warehouse/invoices"
        method="get"
        className="mb-6 flex flex-wrap gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="송장번호 또는 주문번호로 검색"
          className="flex-1 min-w-[200px] px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <select
          name="status"
          defaultValue={status}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="all">상태: 전체</option>
          <option value="pending">대기</option>
          <option value="completed">완료</option>
        </select>
        <select
          name="type"
          defaultValue={customerType}
          className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="all">분류: 전체</option>
          <option value="business">사업자</option>
          <option value="individual">개인</option>
          <option value="retail">소매</option>
          <option value="none">미분류</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
        >
          검색
        </button>
        {isFiltered && (
          <Link
            href="/warehouse/invoices"
            className="px-4 py-2 border border-zinc-300 rounded-lg text-sm hover:bg-zinc-50 transition"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 빈 상태 */}
      {invoices.length === 0 ? (
        isFiltered ? (
          <div className="text-center py-16 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-500 mb-1">검색 결과가 없습니다.</p>
            <p className="text-xs text-zinc-400">
              조건을 바꾸거나 초기화 버튼을 눌러보세요.
            </p>
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed border-zinc-300 rounded-lg">
            <p className="text-zinc-600 mb-1 text-base">
              아직 등록된 송장이 없습니다.
            </p>
            <p className="text-xs text-zinc-400 mb-6">
              발주서와 송장 파일을 업로드해 시작하세요.
            </p>
            <Link
              href="/warehouse/upload"
              className="inline-block px-6 py-3 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
            >
              📤 송장 업로드
            </Link>
          </div>
        )
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          {/* 헤더 */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-600">
            <div className="col-span-3">송장번호</div>
            <div className="col-span-2">주문번호</div>
            <div className="col-span-2">수령인</div>
            <div className="col-span-1 text-center">분류</div>
            <div className="col-span-1 text-center">진행</div>
            <div className="col-span-1 text-center">상태</div>
            <div className="col-span-2 text-center">작성일</div>
          </div>

          {/* 행 */}
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/warehouse/invoices/${inv.id}`}
              className="block sm:grid sm:grid-cols-12 gap-3 px-4 py-3 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition text-sm"
            >
              <div className="sm:col-span-3 font-mono text-zinc-900 truncate">
                {inv.invoice_no}
              </div>
              <div className="sm:col-span-2 font-mono text-xs text-zinc-600 truncate">
                {inv.order_no ?? <span className="text-zinc-300">-</span>}
              </div>
              <div className="sm:col-span-2 text-zinc-700 truncate">
                <span className="sm:hidden text-zinc-400 text-xs mr-1">수령인:</span>
                {maskName(inv.recipient_name)}
                <span className="text-xs text-zinc-400 ml-1">
                  {maskPhone(inv.recipient_phone)}
                </span>
              </div>
              <div className="sm:col-span-1 sm:text-center">
                <span className="sm:hidden text-zinc-400 text-xs mr-1">분류:</span>
                {customerTypeBadge(inv.customer_type)}
              </div>
              <div className="sm:col-span-1 sm:text-center text-zinc-600 text-xs">
                <span className="sm:hidden text-zinc-400 mr-1">진행:</span>
                {inv.scanned_qty} / {inv.total_qty}
              </div>
              <div className="sm:col-span-1 sm:text-center">
                {inv.status === "completed" ? (
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200">
                    완료
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">
                    대기
                  </span>
                )}
              </div>
              <div className="sm:col-span-2 sm:text-center text-zinc-500 text-xs">
                {formatDate(inv.created_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
