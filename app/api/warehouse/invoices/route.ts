import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  fetchInvoiceList,
  decodeCursor,
  INVOICE_PAGE_SIZE,
  type InvoiceListFilters,
} from "@/lib/invoice-list";

const ALLOWED_TYPES = new Set(["business", "individual", "retail", "none"]);

// GET: 완료 탭 keyset 페이지네이션 (로그인 필수).
//   ★ 필터(q/type/from/to)는 DB 전체에 WHERE로 적용한다 — "로드된 것만 검색"이 아님.
//   cursor 이후 INVOICE_PAGE_SIZE건 + hasMore/nextCursor 반환. BYTEA/이미지 없음.
//   완료(활성) 송장 전용 — 대기 탭/삭제 보기는 페이지 SSR에서 처리.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const typeRaw = url.searchParams.get("type") ?? "all";
    const customerType = ALLOWED_TYPES.has(typeRaw) ? typeRaw : "all";
    const isDate = (v: string | null): v is string =>
      !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = isDate(fromRaw) ? fromRaw : "";
    const to = isDate(toRaw) ? toRaw : "";
    const cursor = decodeCursor(url.searchParams.get("cursor"));

    const filters: InvoiceListFilters = {
      tab: "done",
      viewDeleted: false,
      q,
      customerType,
      from,
      to,
    };

    const { rows, nextCursor, hasMore } = await fetchInvoiceList(filters, {
      limit: INVOICE_PAGE_SIZE,
      cursor,
    });

    return NextResponse.json({ rows, nextCursor, hasMore });
  } catch (error) {
    console.error("송장 목록 페이지네이션 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
