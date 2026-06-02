import { NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";
import { maskName, maskPhone, maskAddress } from "@/lib/mask";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/scan
// 통합 바코드 스캔 API.
// body: { barcode, current_invoice_id?, force? }
//
// 서버 판별 순서:
//   1) invoices.invoice_no 일치 → 새 송장 진입
//      - current 진행률 > 0 이고 force 아니면 invoice_change_pending
//      - force=true면 그대로 invoice_start
//   2) items.barcode 일치 + current 송장의 invoice_items에 있음
//      → scan_ok | scan_over_quantity | invoice_complete
//   3) items.barcode 일치 + current 송장에 없음 → scan_wrong_item
//   4) items.barcode 일치 + current 송장 없음 → scan_no_invoice
//   5) 어디에도 없음 → scan_unknown
//
// 모든 품목 스캔 시도는 scan_logs에 기록.
// 송장 진입/완료/강제전환은 access_logs에만 기록 (중복 방지).
// ─────────────────────────────────────────────────────────────

type ScanBody = {
  barcode?: unknown;
  current_invoice_id?: unknown;
  force?: unknown;
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    const userId = Number(session.user.id);

    const body: ScanBody = await request.json().catch(() => ({}));
    const barcode =
      typeof body.barcode === "string" ? body.barcode.trim() : "";
    const currentInvoiceId =
      typeof body.current_invoice_id === "number"
        ? body.current_invoice_id
        : null;
    const force = body.force === true;

    if (!barcode) {
      return NextResponse.json(
        { error: "바코드를 입력하세요." },
        { status: 400 }
      );
    }

    // ── 1) invoice_no 매칭? ─────────────────────────────────
    const invMatch = await query(
      `SELECT i.id, i.invoice_no, i.status,
              COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
              COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
         FROM invoices i
         LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE i.invoice_no = $1
        GROUP BY i.id`,
      [barcode]
    );

    if (invMatch.rows.length > 0) {
      const nextInv = invMatch.rows[0];

      if (nextInv.status === "completed") {
        return NextResponse.json(
          { type: "scan_unknown", message: "이미 완료된 송장입니다." },
          { status: 409 }
        );
      }

      // 현재 진행 중 송장이 있고, 진행률 > 0 이고, 다른 송장이고, force 아님 → 확인 요청
      if (
        currentInvoiceId &&
        currentInvoiceId !== nextInv.id &&
        !force
      ) {
        const cur = await query(
          `SELECT i.id, i.invoice_no,
                  COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
                  COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
             FROM invoices i
             LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
            WHERE i.id = $1
            GROUP BY i.id`,
          [currentInvoiceId]
        );
        if (cur.rows.length > 0 && cur.rows[0].scanned_qty > 0) {
          return NextResponse.json(
            {
              type: "invoice_change_pending",
              message: "진행 중인 송장이 있습니다. 그대로 이동할까요?",
              next_invoice: {
                id: nextInv.id,
                invoice_no: nextInv.invoice_no,
              },
              current_invoice: {
                id: cur.rows[0].id,
                invoice_no: cur.rows[0].invoice_no,
                scanned_qty: cur.rows[0].scanned_qty,
                total_qty: cur.rows[0].total_qty,
              },
            },
            { status: 409 }
          );
        }
      }

      // 새 송장 진입 — 전체 정보 + 품목 목록 반환
      const startPayload = await loadInvoiceFull(nextInv.id);
      if (!startPayload) {
        return NextResponse.json(
          { type: "scan_unknown", message: "송장을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      await logAccess({
        session,
        action: force ? "invoice.force_change" : "invoice.scan_start",
        targetType: "invoice",
        targetId: nextInv.id,
        request,
      });

      return NextResponse.json({
        type: "invoice_start",
        invoice: startPayload.invoice,
        items: startPayload.items,
      });
    }

    // ── 2~5) items.barcode 매칭 검사 ──────────────────────────
    const itemMatch = await query(
      `SELECT id, name FROM items WHERE barcode = $1 LIMIT 1`,
      [barcode]
    );

    if (itemMatch.rows.length === 0) {
      // 어디에도 없음 → scan_unknown
      await query(
        `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason)
         VALUES ($1, NULL, $2, true, 'unknown')`,
        [currentInvoiceId, userId]
      );
      return NextResponse.json(
        { type: "scan_unknown", message: "등록되지 않은 바코드입니다." },
        { status: 404 }
      );
    }

    const matchedItem = itemMatch.rows[0];

    // 현재 송장 없음 → scan_no_invoice
    if (!currentInvoiceId) {
      await query(
        `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason)
         VALUES (NULL, $1, $2, true, 'no_invoice')`,
        [matchedItem.id, userId]
      );
      return NextResponse.json(
        {
          type: "scan_no_invoice",
          message: "먼저 송장을 스캔하세요.",
        },
        { status: 409 }
      );
    }

    // 현재 송장에 그 품목이 있는지 확인 → 트랜잭션으로 카운트 처리
    const result = await withTransaction(async (client) => {
      // 송장 + 품목 행 락
      const rowsRes = await client.query(
        `SELECT ii.id AS invoice_item_id, ii.item_id, ii.quantity, ii.scanned_count
           FROM invoice_items ii
          WHERE ii.invoice_id = $1
          FOR UPDATE`,
        [currentInvoiceId]
      );
      const rows: Array<{
        invoice_item_id: number;
        item_id: number;
        quantity: number;
        scanned_count: number;
      }> = rowsRes.rows;

      const target = rows.find((r) => r.item_id === matchedItem.id);

      // 송장에 없는 품목 → wrong_item
      if (!target) {
        await client.query(
          `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason)
           VALUES ($1, $2, $3, true, 'wrong_item')`,
          [currentInvoiceId, matchedItem.id, userId]
        );
        return {
          kind: "wrong_item" as const,
          itemName: matchedItem.name as string,
        };
      }

      // 카운트 +1 (초과는 허용하되 기록)
      const nextCount = target.scanned_count + 1;
      const isOver = nextCount > target.quantity;

      await client.query(
        `UPDATE invoice_items SET scanned_count = $1 WHERE id = $2`,
        [nextCount, target.invoice_item_id]
      );

      // 첫 스캔 시점 기록 (NULL일 때만)
      await client.query(
        `UPDATE invoices
            SET scan_started_at = COALESCE(scan_started_at, NOW()),
                scan_started_by = COALESCE(scan_started_by, $1)
          WHERE id = $2`,
        [userId, currentInvoiceId]
      );

      // scan_log
      await client.query(
        `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          currentInvoiceId,
          matchedItem.id,
          userId,
          isOver,
          isOver ? "over_quantity" : null,
        ]
      );

      // 완료 판정 — 락이 걸린 메모리 값으로 합계 계산
      const updatedRows = rows.map((r) =>
        r.invoice_item_id === target.invoice_item_id
          ? { ...r, scanned_count: nextCount }
          : r
      );
      const totalQty = updatedRows.reduce((s, r) => s + r.quantity, 0);
      const scannedQty = updatedRows.reduce(
        (s, r) => s + Math.min(r.scanned_count, r.quantity),
        0
      );
      // 완료 판정은 "각 품목이 quantity 이상" 모두 채워졌을 때
      const allFilled =
        updatedRows.length > 0 &&
        updatedRows.every((r) => r.scanned_count >= r.quantity);

      let completedAt: string | null = null;
      if (allFilled) {
        const upd = await client.query(
          `UPDATE invoices
              SET status = 'completed',
                  completed_at = NOW(),
                  completed_by = $1
            WHERE id = $2
              AND status <> 'completed'
            RETURNING completed_at`,
          [userId, currentInvoiceId]
        );
        if (upd.rows.length > 0) {
          completedAt = upd.rows[0].completed_at;
        }
      }

      return {
        kind: allFilled && completedAt ? ("complete" as const) : isOver ? ("over" as const) : ("ok" as const),
        item: {
          invoice_item_id: target.invoice_item_id,
          item_id: target.item_id,
          name: matchedItem.name as string,
          quantity: target.quantity,
          scanned_count: nextCount,
        },
        invoice: {
          id: currentInvoiceId,
          scanned_qty: scannedQty,
          total_qty: totalQty,
          completed_at: completedAt,
        },
      };
    });

    if (result.kind === "wrong_item") {
      return NextResponse.json({
        type: "scan_wrong_item",
        item: { name: result.itemName },
        message: `이 품목은 다른 송장의 품목입니다. 필요하면 해당 송장을 먼저 스캔하세요.`,
      });
    }

    if (result.kind === "complete") {
      // 완료 송장의 invoice_no 다시 한 번 조회 (응답 표시용)
      const noRes = await query(
        `SELECT invoice_no FROM invoices WHERE id = $1`,
        [result.invoice.id]
      );
      await logAccess({
        session,
        action: "invoice.complete",
        targetType: "invoice",
        targetId: result.invoice.id,
        request,
      });
      return NextResponse.json({
        type: "invoice_complete",
        item: result.item,
        invoice: {
          id: result.invoice.id,
          invoice_no: noRes.rows[0]?.invoice_no ?? null,
          scanned_qty: result.invoice.scanned_qty,
          total_qty: result.invoice.total_qty,
          completed_at: result.invoice.completed_at,
        },
      });
    }

    if (result.kind === "over") {
      return NextResponse.json({
        type: "scan_over_quantity",
        message: `이미 수량을 초과했습니다 (${result.item.scanned_count}/${result.item.quantity})`,
        item: result.item,
        invoice: {
          id: result.invoice.id,
          scanned_qty: result.invoice.scanned_qty,
          total_qty: result.invoice.total_qty,
        },
      });
    }

    return NextResponse.json({
      type: "scan_ok",
      item: result.item,
      invoice: {
        id: result.invoice.id,
        scanned_qty: result.invoice.scanned_qty,
        total_qty: result.invoice.total_qty,
      },
    });
  } catch (error) {
    console.error("스캔 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// invoice_start 응답용 — 송장 전체 정보 + 품목 목록.
// 평문 PII는 절대 반환하지 않고 서버에서 마스킹해서 내려보냄.
async function loadInvoiceFull(invoiceId: number): Promise<{
  invoice: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
} | null> {
  const [invRes, itemsRes] = await Promise.all([
    query(
      `SELECT
         i.id, i.invoice_no, i.order_no, i.status,
         i.recipient_name, i.recipient_phone, i.recipient_address,
         i.recipient_postal_code, i.delivery_note, i.sender_name,
         i.customer_type, i.created_at,
         COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
         COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.id = $1
       GROUP BY i.id`,
      [invoiceId]
    ),
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
      [invoiceId]
    ),
  ]);
  if (invRes.rows.length === 0) return null;
  const raw = invRes.rows[0];
  return {
    invoice: {
      id: raw.id,
      invoice_no: raw.invoice_no,
      order_no: raw.order_no,
      status: raw.status,
      sender_name: raw.sender_name,
      customer_type: raw.customer_type,
      delivery_note: raw.delivery_note,
      recipient_postal_code: raw.recipient_postal_code,
      recipient_name_masked: maskName(raw.recipient_name),
      recipient_phone_masked: maskPhone(raw.recipient_phone),
      recipient_address_masked: maskAddress(raw.recipient_address),
      total_qty: raw.total_qty,
      scanned_qty: raw.scanned_qty,
    },
    items: itemsRes.rows,
  };
}
