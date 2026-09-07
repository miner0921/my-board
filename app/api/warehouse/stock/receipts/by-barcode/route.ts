import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helper";
import { loadReceipt, normalizeReceiptNo } from "@/lib/stock-receipt";

// ─────────────────────────────────────────────────────────────
// GET /api/warehouse/stock/receipts/by-barcode?no=RC0000012
// 현장에서 입고증 바코드를 찍으면 예정 품목이 쭉 나온다. (로그인 작업자)
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const receiptNo = normalizeReceiptNo(searchParams.get("no"));
    if (!receiptNo) {
      return NextResponse.json(
        { error: "입고증 바코드가 아닙니다." },
        { status: 400 }
      );
    }

    const full = await loadReceipt({ receiptNo });
    if (!full) {
      return NextResponse.json(
        { error: "입고증을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (full.receipt.status === "canceled") {
      return NextResponse.json(
        { error: "취소된 입고증입니다." },
        { status: 409 }
      );
    }

    return NextResponse.json(full);
  } catch (e) {
    console.error("입고증 조회 실패:", e);
    return NextResponse.json(
      { error: "입고증 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
