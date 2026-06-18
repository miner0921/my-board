import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { readUploadedXlsx } from "@/lib/upload";
import {
  parseOrderSheet,
  parseInvoiceSheet,
  orderMatchKey,
  type OrderRow,
  type InvoiceRow,
} from "@/lib/parse-excel";
import { parseProductName } from "@/lib/parse-product";
import { buildItemIndex } from "@/lib/resolve-item";

// POST: 발주서/송장 파일 두 개 받아서 분석 결과만 반환 (저장 X)
// 실제 저장은 /confirm에서 같은 파일을 다시 받아 트랜잭션으로 처리.
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const orderFile = formData.get("order");
    const invoiceFile = formData.get("invoice");
    if (!(orderFile instanceof File) || !(invoiceFile instanceof File)) {
      return NextResponse.json(
        { error: "발주서와 송장 파일을 모두 업로드해주세요." },
        { status: 400 }
      );
    }

    const orderRead = await readUploadedXlsx(orderFile);
    if (!orderRead.ok) {
      return NextResponse.json(
        { error: `발주서: ${orderRead.error}` },
        { status: 400 }
      );
    }
    const invoiceRead = await readUploadedXlsx(invoiceFile);
    if (!invoiceRead.ok) {
      return NextResponse.json(
        { error: `송장: ${invoiceRead.error}` },
        { status: 400 }
      );
    }

    // 파싱 (실패 시 친절한 에러)
    let orderParse;
    try {
      orderParse = parseOrderSheet(orderRead.buffer);
    } catch (e) {
      console.error("발주서 파싱 실패:", e);
      return NextResponse.json(
        { error: "발주서 파일을 읽을 수 없습니다. 시트 구조와 컬럼명을 확인해주세요." },
        { status: 400 }
      );
    }
    let invoiceRows: InvoiceRow[];
    try {
      invoiceRows = parseInvoiceSheet(invoiceRead.buffer);
    } catch (e) {
      console.error("송장 파싱 실패:", e);
      return NextResponse.json(
        { error: "송장 파일을 읽을 수 없습니다. 컬럼명을 확인해주세요." },
        { status: 400 }
      );
    }

    const { rows: orderRows, sheetCounts } = orderParse;

    // 발주서 매칭 맵
    const orderMap = new Map<string, OrderRow[]>();
    for (const r of orderRows) {
      const key = orderMatchKey(r.orderNo);
      const arr = orderMap.get(key) ?? [];
      arr.push(r);
      orderMap.set(key, arr);
    }

    // 송장 순회 → 매칭
    type Matched = { invoice: InvoiceRow; order: OrderRow | null };
    const matched: Matched[] = [];
    const onlyInInvoice: InvoiceRow[] = [];
    const usedOrderKeys = new Set<string>();
    for (const inv of invoiceRows) {
      const key = orderMatchKey(inv.orderNo);
      const hits = orderMap.get(key);
      if (hits && hits.length > 0) {
        usedOrderKeys.add(key);
        matched.push({ invoice: inv, order: hits[0] });
      } else {
        onlyInInvoice.push(inv);
      }
    }

    // 매칭 안 된 발주서
    const onlyInOrder: OrderRow[] = [];
    for (const [key, rows] of orderMap.entries()) {
      if (!usedOrderKeys.has(key)) onlyInOrder.push(...rows);
    }

    // 기존 items 로드 → 정규화 품명 인덱스 (매칭 단일 지점)
    const existing = await query(
      "SELECT id, name FROM items WHERE deleted_at IS NULL"
    );
    const existingNormalized = buildItemIndex(existing.rows);

    // 매칭된 송장의 상품명 파싱 + 새 품목 식별
    const allNormalized = new Set<string>();

    const matchedDetail = matched.map((m) => {
      const productRaw =
        m.invoice.productNameRaw || m.order?.productNameRaw || "";
      const parsed = parseProductName(productRaw);
      const items = parsed.items.map((it) => {
        allNormalized.add(it.normalizedName);
        return {
          rawName: it.rawName,
          normalizedName: it.normalizedName,
          qty: it.qty,
          isNew: !existingNormalized.has(it.normalizedName),
        };
      });
      return {
        invoiceNo: m.invoice.invoiceNo,
        orderNo: m.invoice.orderNo,
        recipientName: m.invoice.recipientName || m.order?.recipientName || "",
        recipientPhone:
          m.invoice.recipientPhone || m.order?.recipientPhone || "",
        recipientAddress:
          m.order?.address || m.invoice.recipientAddress || "",
        customerType: m.order?.customerType ?? null,
        items,
        notes: parsed.notes,
      };
    });

    const onlyInInvoiceDetail = onlyInInvoice.map((inv) => {
      const parsed = parseProductName(inv.productNameRaw);
      const items = parsed.items.map((it) => {
        allNormalized.add(it.normalizedName);
        return {
          rawName: it.rawName,
          normalizedName: it.normalizedName,
          qty: it.qty,
          isNew: !existingNormalized.has(it.normalizedName),
        };
      });
      return {
        invoiceNo: inv.invoiceNo,
        orderNo: inv.orderNo,
        recipientName: inv.recipientName,
        recipientAddress: inv.recipientAddress,
        items,
        notes: parsed.notes,
      };
    });

    const newItemNames: string[] = [];
    for (const norm of allNormalized) {
      if (!existingNormalized.has(norm)) newItemNames.push(norm);
    }

    const totalNotes =
      matchedDetail.reduce((sum, m) => sum + m.notes.length, 0) +
      onlyInInvoiceDetail.reduce((sum, m) => sum + m.notes.length, 0);

    return NextResponse.json({
      summary: {
        matchedCount: matched.length,
        onlyInOrderCount: onlyInOrder.length,
        onlyInInvoiceCount: onlyInInvoice.length,
        newItemsCount: newItemNames.length,
        totalNotes,
        sheetCounts,
      },
      matched: matchedDetail,
      onlyInOrder: onlyInOrder.map((r) => ({
        orderNo: r.orderNo,
        recipientName: r.recipientName,
        productNameRaw: r.productNameRaw,
        customerType: r.customerType,
      })),
      onlyInInvoice: onlyInInvoiceDetail,
      newItems: newItemNames,
    });
  } catch (error) {
    console.error("미리보기 처리 에러:", error);
    return NextResponse.json(
      { error: "분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
