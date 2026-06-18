import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/scan/add
// 품목을 "검색해서" 현장 추가 — 바코드 없는 품목도 송장에 넣기 위함.
// body: { invoice_id, item_id }
//
// 현장 추가(force-add, 바코드 발)와 동일한 모델:
//   - invoice_items 새 행 INSERT (quantity=1, is_added_on_scan=TRUE)
//   - 단, scanned_count=0 (아직 안 챙김) → 추가 후 수동 챙김으로 수량 확인.
//   - 완료된 송장에 추가하면 자동 재개(스캔 흐름과 동일).
// 이미 송장에 있는 활성 품목이면 already_present (중복 추가 안 함).
// 제외(excluded)된 품목이면 복구(un-exclude).
// ─────────────────────────────────────────────────────────────

type Body = { invoice_id?: unknown; item_id?: unknown };

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

    const body: Body = await request.json().catch(() => ({}));
    const invoiceId =
      typeof body.invoice_id === "number" ? body.invoice_id : null;
    const itemId = typeof body.item_id === "number" ? body.item_id : null;
    if (!invoiceId || !itemId) {
      return NextResponse.json(
        { error: "invoice_id, item_id가 필요합니다." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 송장 락 (invoices → invoice_items 순서로 데드락 방지)
      const invSel = await client.query(
        `SELECT id, status, completed_at, completed_by,
                completion_reason, completion_note
           FROM invoices
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [invoiceId]
      );
      if (invSel.rows.length === 0) return { kind: "not_found" as const };
      const invRow = invSel.rows[0];
      const isInvoiceDone =
        invRow.status === "completed" || invRow.status === "completed_partial";

      // 추가할 품목 존재 확인 + 카드 표시용 정보
      const itemSel = await client.query(
        `SELECT id, name, barcode, scan_exempt, updated_at,
                (image_data IS NOT NULL) AS has_image
           FROM items
          WHERE id = $1 AND deleted_at IS NULL`,
        [itemId]
      );
      if (itemSel.rows.length === 0) return { kind: "item_not_found" as const };
      const item = itemSel.rows[0];

      // 기존 매핑 행 확인 (활성/제외)
      const existing = await client.query(
        `SELECT id, excluded_at, quantity, scanned_count
           FROM invoice_items
          WHERE invoice_id = $1 AND item_id = $2
          FOR UPDATE`,
        [invoiceId, itemId]
      );

      let invoiceItemId: number;
      let quantity: number;
      let scannedCount: number;
      let outcome: "added" | "restored" | "already_present";

      if (existing.rows.length > 0 && existing.rows[0].excluded_at === null) {
        // 이미 송장에 있는 활성 품목 → 그대로 반환 (중복 추가 안 함)
        invoiceItemId = existing.rows[0].id;
        quantity = existing.rows[0].quantity;
        scannedCount = existing.rows[0].scanned_count;
        outcome = "already_present";
      } else {
        // 완료 송장이면 먼저 자동 재개 (추가/복구로 미완료가 되므로)
        if (isInvoiceDone) {
          await client.query(
            `INSERT INTO invoice_reopens
               (invoice_id, reopened_by, reason, is_manual,
                prev_status, prev_completion_reason, prev_completion_note,
                prev_completed_at, prev_completed_by)
             VALUES ($1, $2, '품목 추가로 자동 재개', false, $3, $4, $5, $6, $7)`,
            [
              invoiceId,
              userId,
              invRow.status,
              invRow.completion_reason,
              invRow.completion_note,
              invRow.completed_at,
              invRow.completed_by,
            ]
          );
          await client.query(
            `UPDATE invoices
                SET status = 'pending', completed_at = NULL, completed_by = NULL,
                    completion_reason = NULL, completion_note = NULL
              WHERE id = $1`,
            [invoiceId]
          );
        }

        // 신규 행 INSERT, 제외돼 있던 행이면 복구(un-exclude). scanned_count 보존.
        const ins = await client.query(
          `INSERT INTO invoice_items
             (invoice_id, item_id, quantity, scanned_count, display_name, is_added_on_scan)
           VALUES ($1, $2, 1, 0, $3, TRUE)
           ON CONFLICT (invoice_id, item_id) DO UPDATE
             SET excluded_at = NULL, excluded_by = NULL, exclude_reason = NULL
           RETURNING id, quantity, scanned_count`,
          [invoiceId, itemId, item.name]
        );
        invoiceItemId = ins.rows[0].id;
        quantity = ins.rows[0].quantity;
        scannedCount = ins.rows[0].scanned_count;
        outcome = existing.rows.length > 0 ? "restored" : "added";

        // 첫 시작 시점 기록 + 감사용 스캔 로그
        await client.query(
          `UPDATE invoices
              SET scan_started_at = COALESCE(scan_started_at, NOW()),
                  scan_started_by = COALESCE(scan_started_by, $1)
            WHERE id = $2`,
          [userId, invoiceId]
        );
        await client.query(
          `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason, quantity)
           VALUES ($1, $2, $3, false, 'item_added', 0)`,
          [invoiceId, itemId, userId]
        );
      }

      // 진행률 재계산 (제외 품목 제외)
      const agg = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS total_qty,
                COALESCE(SUM(LEAST(scanned_count, quantity)), 0)::int AS scanned_qty
           FROM invoice_items
          WHERE invoice_id = $1 AND excluded_at IS NULL`,
        [invoiceId]
      );

      return {
        kind: outcome,
        autoReopened: isInvoiceDone && outcome !== "already_present",
        item: {
          invoice_item_id: invoiceItemId,
          item_id: item.id,
          name: item.name as string,
          display_name: item.name as string,
          quantity,
          scanned_count: scannedCount,
          barcode: item.barcode as string | null,
          updated_at: item.updated_at,
          has_image: item.has_image as boolean,
          scan_exempt: item.scan_exempt as boolean,
          is_added_on_scan: true,
        },
        invoice: {
          id: invoiceId,
          // 추가/복구는 (필요 시 재개돼) pending. 이미 있던 활성 품목이면 상태 불변.
          status: outcome === "already_present" ? invRow.status : "pending",
          scanned_qty: agg.rows[0].scanned_qty,
          total_qty: agg.rows[0].total_qty,
        },
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "item_not_found") {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (result.autoReopened) {
      await logAccess({
        session,
        action: "invoice.auto_reopened",
        targetType: "invoice",
        targetId: invoiceId,
        request,
      });
    }
    await logAccess({
      session,
      action: "invoice.item_search_added",
      targetType: "invoice",
      targetId: invoiceId,
      request,
    });

    return NextResponse.json({
      type: "scan_added",
      outcome: result.kind, // added | restored | already_present
      auto_reopened: result.autoReopened,
      item: result.item,
      invoice: {
        id: invoiceId,
        status: result.invoice.status,
        scanned_qty: result.invoice.scanned_qty,
        total_qty: result.invoice.total_qty,
      },
    });
  } catch (error) {
    console.error("품목 검색 추가 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
