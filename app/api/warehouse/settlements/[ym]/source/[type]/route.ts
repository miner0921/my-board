import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { isValidYm } from "@/lib/settlement";

// ─────────────────────────────────────────────────────────────
// GET /api/warehouse/settlements/[ym]/source/[type] — 업로드 원본 엑셀 내려받기 (관리자)
//   type = shipments | agreements | processing | inout
//
// 정산 숫자가 어디서 나왔는지 확인하는 용도. 화면으로 훑을 일은 드물고
// 필요할 때 받아서 엑셀에서 거르는 쪽이 빨라 다운로드만 둔다.
//
// ⚠️ 출고현황·협의건에는 수하인 성명/주소가 들어 있다. 관리자만 받을 수 있다.
// ─────────────────────────────────────────────────────────────

type Params = { params: Promise<{ ym: string; type: string }> };
type Row = (string | number | null)[];

// 타입별로 [파일명, 헤더, 조회 SQL, 행 → 엑셀 한 줄] 만 다르다.
const SOURCES = {
  shipments: {
    label: "출고현황",
    header: ["No", "정산 분류", "구분", "최초지시일", "운송장번호", "주문번호",
             "취소사유", "수하인명", "주소", "송하인명", "상품명"],
    sql: `SELECT seq, settle_type, kind, order_date::text AS order_date,
                 tracking_no, order_no, cancel_reason,
                 receiver_name, receiver_addr, sender_name, product_name
            FROM settlement_shipments WHERE month_id = $1
           ORDER BY seq NULLS LAST, id`,
    row: (r: Record<string, unknown>): Row => [
      r.seq as number | null, r.settle_type as string, r.kind as string,
      r.order_date as string | null, r.tracking_no as string, r.order_no as string,
      r.cancel_reason as string, r.receiver_name as string, r.receiver_addr as string,
      r.sender_name as string, r.product_name as string,
    ],
  },
  agreements: {
    label: "협의건",
    header: ["집하일자", "운송장번호", "작업구분", "운임합계",
             "수하인명", "수하인주소", "상품명", "제주연계"],
    sql: `SELECT pickup_date::text AS pickup_date, tracking_no, kind, freight_total,
                 receiver_name, receiver_addr, product_name, jeju_link
            FROM settlement_agreements WHERE month_id = $1
           ORDER BY pickup_date, id`,
    row: (r: Record<string, unknown>): Row => [
      r.pickup_date as string | null, r.tracking_no as string, r.kind as string,
      r.freight_total === null ? null : Number(r.freight_total),
      r.receiver_name as string, r.receiver_addr as string, r.product_name as string,
      r.jeju_link === null ? null : Number(r.jeju_link),
    ],
  },
  processing: {
    label: "유통가공 세부내역",
    header: ["항목", "일자", "수량"],
    sql: `SELECT label, work_date::text AS work_date, qty
            FROM settlement_daily WHERE month_id = $1 AND source = 'processing'
           ORDER BY label, work_date NULLS FIRST`,
    row: (r: Record<string, unknown>): Row => [
      r.label as string,
      (r.work_date as string | null) ?? "월말 기준",
      Number(r.qty),
    ],
  },
  inout: {
    label: "입출고 세부내역",
    header: ["입/출고", "항목", "일자", "수량"],
    sql: `SELECT source, label, work_date::text AS work_date, qty
            FROM settlement_daily WHERE month_id = $1 AND source IN ('inout_in','inout_out')
           ORDER BY source, label, work_date NULLS FIRST`,
    row: (r: Record<string, unknown>): Row => [
      r.source === "inout_in" ? "입 고" : "출 고",
      r.label as string,
      (r.work_date as string | null) ?? "월말 기준",
      Number(r.qty),
    ],
  },
} as const;

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { ym, type } = await params;
    if (!isValidYm(ym) || !(type in SOURCES)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const src = SOURCES[type as keyof typeof SOURCES];

    const monthRes = await query(`SELECT id FROM settlement_months WHERE ym = $1`, [ym]);
    const monthId: number | undefined = monthRes.rows[0]?.id;
    if (!monthId) {
      return NextResponse.json({ error: "정산 월을 찾을 수 없습니다." }, { status: 404 });
    }

    const res = await query(src.sql, [monthId]);
    const aoa: Row[] = [[...src.header], ...res.rows.map(src.row)];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = src.header.map((h) => ({ wch: h === "상품명" ? 44 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, src.label);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const filename = `${src.label}_${ym}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // 한글 파일명은 filename* (RFC 5987) 로만 안전하게 전달된다.
        "Content-Disposition": `attachment; filename="${type}_${ym}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("정산 원본 내보내기 실패:", e);
    return NextResponse.json({ error: "엑셀을 만들지 못했습니다." }, { status: 500 });
  }
}
