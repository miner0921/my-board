import { query } from "@/lib/db";

// 송장 목록 1행 (목록 컬럼만 — BYTEA/이미지 없음).
export type InvoiceListRow = {
  id: number;
  invoice_no: string;
  order_no: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  status: string;
  customer_type: string | null;
  created_at: string;
  completed_at: string | null;
  match_tag: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
  total_qty: number;
  scanned_qty: number;
};

export type InvoiceTab = "pending" | "done";

export type InvoiceListFilters = {
  tab: InvoiceTab;
  viewDeleted: boolean;
  q: string; // 검색어(트림됨, "" = 없음)
  customerType: string; // "all" | business | individual | retail | none
  from: string; // "" | YYYY-MM-DD
  to: string; // "" | YYYY-MM-DD
  // 상태 필터(탭별 의미, "all"=전체):
  //   완료 탭: "completed" | "completed_partial"  (status 기반, WHERE)
  //   대기 탭: "waiting"(scanned=0) | "inspecting"(scanned>0)  (진행률 기반, HAVING)
  statusFilter: string;
};

// 완료 탭 keyset 커서. (completed_at, id) 기준 안정 페이지네이션.
//   completed_at은 epoch ms(t)로 인코딩 — 문자열 TZ 해석 왜곡을 원천 차단.
export type InvoiceCursor = { t: number; id: number };

// 한 번에 보여줄 완료 송장 수.
export const INVOICE_PAGE_SIZE = 100;

const ALLOWED_TYPES = new Set(["business", "individual", "retail", "none"]);

export function encodeCursor(c: InvoiceCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): InvoiceCursor | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof obj?.t === "number" && typeof obj?.id === "number") {
      return { t: obj.t, id: obj.id };
    }
  } catch {
    /* 손상된 커서는 무시(1페이지부터) */
  }
  return null;
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// 송장 목록 조회 (★ 서버 전용 — pg 풀 사용).
//   - 필터(q/type/from/to)는 ★ 항상 DB 전체에 WHERE로 적용. "로드된 것만 검색"이 아님.
//   - opts.limit 지정(완료 탭): keyset 페이지네이션. limit+1 fetch로 hasMore 판정.
//   - opts.limit 미지정(대기 탭/삭제 보기): 전체 반환(현행 동작 유지).
export async function fetchInvoiceList(
  filters: InvoiceListFilters,
  opts: { limit?: number; cursor?: InvoiceCursor | null } = {}
): Promise<{ rows: InvoiceListRow[]; nextCursor: string | null; hasMore: boolean }> {
  const { tab, viewDeleted, q, customerType, from, to, statusFilter } = filters;
  // 정렬축(=날짜 필터·keyset 축): 삭제 보기=삭제일(deleted_at),
  //   완료=완료일(completed_at), 대기=등록일(created_at).
  //   sortField = 커서 row 접근용 컬럼명, orderCol = SQL 식별자.
  //   세 축 모두 페이지네이션 대상에선 NOT NULL 보장(WHERE 조건) → keyset 안전.
  const sortField = viewDeleted
    ? "deleted_at"
    : tab === "done"
      ? "completed_at"
      : "created_at";
  const orderCol = `i.${sortField}`;
  const paginated = typeof opts.limit === "number";

  const conditions: string[] = [
    viewDeleted ? "i.deleted_at IS NOT NULL" : "i.deleted_at IS NULL",
  ];
  const params: unknown[] = [];

  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(
      `(i.invoice_no ILIKE $${params.length} OR i.order_no ILIKE $${params.length} OR i.recipient_name ILIKE $${params.length} OR i.recipient_phone ILIKE $${params.length})`
    );
  }
  // 숨김 보기에서는 상태 탭 조건을 적용하지 않고 숨긴 송장 전부를 보여준다.
  if (!viewDeleted) {
    if (tab === "done") {
      conditions.push(
        `i.status IN ('completed', 'completed_partial') AND i.completed_at IS NOT NULL`
      );
      // 완료 탭 상태 필터(완료/부분완료) — status 기반. 전체면 위 IN 그대로.
      if (statusFilter === "completed") {
        conditions.push(`i.status = 'completed'`);
      } else if (statusFilter === "completed_partial") {
        conditions.push(`i.status = 'completed_partial'`);
      }
    } else {
      conditions.push(`i.status = 'pending'`);
    }
  }
  if (customerType !== "all") {
    if (customerType === "none") {
      conditions.push(`i.customer_type IS NULL`);
    } else if (ALLOWED_TYPES.has(customerType)) {
      params.push(customerType);
      conditions.push(`i.customer_type = $${params.length}`);
    }
  }
  if (from !== "") {
    params.push(from);
    conditions.push(`${orderCol} >= $${params.length}::date`);
  }
  if (to !== "") {
    params.push(to);
    // to 당일 포함 (다음날 0시 미만)
    conditions.push(`${orderCol} < ($${params.length}::date + interval '1 day')`);
  }

  // keyset 커서 — 페이지네이션 시. (정렬축, id) < (커서) = "더 과거".
  //   정렬축은 탭별(완료=completed_at·대기=created_at·삭제=deleted_at).
  if (paginated && opts.cursor) {
    params.push(new Date(opts.cursor.t));
    const pAt = params.length;
    params.push(opts.cursor.id);
    const pId = params.length;
    conditions.push(`(${orderCol}, i.id) < ($${pAt}::timestamp, $${pId}::int)`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  // 대기 탭 상태 필터(대기/검수중) — 진행률 집계라 HAVING으로(WHERE 불가).
  //   대기 = 스캔된 것 0, 검수중 = 1개 이상 스캔됨. 정렬축/keyset과 별개로 적용.
  let havingClause = "";
  if (!viewDeleted && tab === "pending") {
    if (statusFilter === "waiting") {
      havingClause = `HAVING COALESCE(SUM(ii.scanned_count), 0) = 0`;
    } else if (statusFilter === "inspecting") {
      havingClause = `HAVING COALESCE(SUM(ii.scanned_count), 0) > 0`;
    }
  }

  // 페이지네이션은 (정렬축, id) DESC 안정 정렬(동률 타이브레이크 →
  // 페이지 경계 누락/중복 방지). 비페이지네이션(전체)은 기존 NULLS LAST 동작 유지.
  const orderBy = paginated
    ? `ORDER BY ${orderCol} DESC, i.id DESC`
    : `ORDER BY ${orderCol} DESC NULLS LAST`;

  let limitClause = "";
  if (paginated) {
    params.push(opts.limit! + 1); // hasMore 판정용으로 1건 더 받아본다
    limitClause = `LIMIT $${params.length}`;
  }

  const result = await query(
    `SELECT
       i.id, i.invoice_no, i.order_no,
       i.recipient_name, i.recipient_phone,
       i.status, i.customer_type, i.created_at, i.completed_at, i.match_tag,
       i.deleted_at,
       (SELECT du.nickname FROM users du WHERE du.id = i.deleted_by) AS deleted_by_name,
       COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
       COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
     FROM invoices i
     LEFT JOIN invoice_items ii
       ON ii.invoice_id = i.id AND ii.excluded_at IS NULL
     ${where}
     GROUP BY i.id
     ${havingClause}
     ${orderBy}
     ${limitClause}`,
    params
  );

  let raw = result.rows;
  let hasMore = false;
  if (paginated && raw.length > opts.limit!) {
    hasMore = true;
    raw = raw.slice(0, opts.limit!);
  }

  // 다음 커서: 마지막 행의 (정렬축, id). 정규화 전 원본(Date)에서 뽑는다.
  //   정렬축은 sortField(완료=completed_at·대기=created_at·삭제=deleted_at).
  let nextCursor: string | null = null;
  if (hasMore && raw.length > 0) {
    const last = raw[raw.length - 1];
    const c = last[sortField];
    const t = c instanceof Date ? c.getTime() : new Date(c).getTime();
    nextCursor = encodeCursor({ t, id: last.id });
  }

  // 날짜 필드를 ISO 문자열로 정규화(서버/클라/API 공통 표현).
  const rows: InvoiceListRow[] = raw.map((r) => ({
    ...r,
    created_at: toIso(r.created_at)!,
    completed_at: toIso(r.completed_at),
    deleted_at: toIso(r.deleted_at),
  }));

  return { rows, nextCursor, hasMore };
}
