import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/scan/manual
// 바코드 없는 품목 + 동봉물의 "수동 챙김" 확인.
// body: { invoice_id, invoice_item_id, count }  (count = 챙긴 수량, 절대값)
//
// scanned_count 를 count 로 set 하고, 전체 품목 기준으로 완료를 재판정한다.
// (동봉 포함 모든 품목이 채워져야 완료 — 검수 제외 없음)
// 완료된 송장을 수정하면 스캔과 동일하게 자동 재개(invoice_reopens) 처리.
// 응답 형식은 스캔 API와 동일(scan_ok / invoice_complete)해 클라이언트가 재사용.
// ─────────────────────────────────────────────────────────────

type Body = {
  invoice_id?: unknown;
  invoice_item_id?: unknown;
  count?: unknown;
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

    const body: Body = await request.json().catch(() => ({}));
    const invoiceId =
      typeof body.invoice_id === "number" ? body.invoice_id : null;
    const invoiceItemId =
      typeof body.invoice_item_id === "number" ? body.invoice_item_id : null;
    const count =
      typeof body.count === "number" &&
      Number.isInteger(body.count) &&
      body.count >= 0
        ? body.count
        : null;

    if (!invoiceId || !invoiceItemId || count === null) {
      return NextResponse.json(
        { error: "invoice_id, invoice_item_id, count(0 이상 정수)가 필요합니다." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const invSel = await client.query(
        `SELECT id, invoice_no, status, completed_at, completed_by,
                completion_reason, completion_note
           FROM invoices
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [invoiceId]
      );
      if (invSel.rows.length === 0) return { kind: "not_found" as const };
      const invRow = invSel.rows[0] as {
        invoice_no: string;
        status: string;
        completed_at: string | null;
        completed_by: number | null;
        completion_reason: string | null;
        completion_note: string | null;
      };
      const isInvoiceDone =
        invRow.status === "completed" || invRow.status === "completed_partial";

      const rowsRes = await client.query(
        `SELECT ii.id AS invoice_item_id, ii.item_id, ii.quantity, ii.scanned_count,
                it.name AS item_name
           FROM invoice_items ii
           JOIN items it ON it.id = ii.item_id
          WHERE ii.invoice_id = $1
          FOR UPDATE OF ii`,
        [invoiceId]
      );
      const rows: Array<{
        invoice_item_id: number;
        item_id: number;
        quantity: number;
        scanned_count: number;
        item_name: string;
      }> = rowsRes.rows;
      const target = rows.find((r) => r.invoice_item_id === invoiceItemId);
      if (!target) return { kind: "item_missing" as const };

      // 완료된 송장 수정 → 자동 재개
      let autoReopened = false;
      if (isInvoiceDone) {
        await client.query(
          `INSERT INTO invoice_reopens
             (invoice_id, reopened_by, reason,
              prev_status, prev_completion_reason, prev_completion_note,
              prev_completed_at, prev_completed_by)
           VALUES ($1, $2, '수동 챙김 수정으로 자동 재개', $3, $4, $5, $6, $7)`,
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
        autoReopened = true;
      }

      // 챙긴 수량 절대값으로 set
      await client.query(
        `UPDATE invoice_items SET scanned_count = $1 WHERE id = $2`,
        [count, invoiceItemId]
      );
      await client.query(
        `UPDATE invoices
            SET scan_started_at = COALESCE(scan_started_at, NOW()),
                scan_started_by = COALESCE(scan_started_by, $1)
          WHERE id = $2`,
        [userId, invoiceId]
      );
      await client.query(
        `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason)
         VALUES ($1, $2, $3, false, 'manual_pick')`,
        [invoiceId, target.item_id, userId]
      );

      // 완료 재판정 — 모든 품목 기준
      const updatedRows = rows.map((r) =>
        r.invoice_item_id === invoiceItemId ? { ...r, scanned_count: count } : r
      );
      const totalQty = updatedRows.reduce((s, r) => s + r.quantity, 0);
      const scannedQty = updatedRows.reduce(
        (s, r) => s + Math.min(r.scanned_count, r.quantity),
        0
      );
      const allFilled =
        updatedRows.length > 0 &&
        updatedRows.every((r) => r.scanned_count >= r.quantity);

      let completedAt: string | null = null;
      if (allFilled) {
        const upd = await client.query(
          `UPDATE invoices
              SET status = 'completed', completed_at = NOW(),
                  completed_by = $1, completion_reason = 'full'
            WHERE id = $2 AND status <> 'completed' AND status <> 'completed_partial'
            RETURNING completed_at`,
          [userId, invoiceId]
        );
        if (upd.rows.length > 0) completedAt = upd.rows[0].completed_at;
      }

      return {
        kind: "ok" as const,
        autoReopened,
        invoiceNo: invRow.invoice_no,
        item: {
          invoice_item_id: invoiceItemId,
          item_id: target.item_id,
          name: target.item_name,
          quantity: target.quantity,
          scanned_count: count,
        },
        scannedQty,
        totalQty,
        completed: allFilled && !!completedAt,
        completedAt,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "item_missing") {
      return NextResponse.json(
        { error: "해당 품목을 찾을 수 없습니다." },
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
    if (result.completed) {
      await logAccess({
        session,
        action: "invoice.complete",
        targetType: "invoice",
        targetId: invoiceId,
        request,
      });
    }

    return NextResponse.json({
      type: result.completed ? "invoice_complete" : "scan_ok",
      auto_reopened: result.autoReopened,
      item: result.item,
      invoice: {
        id: invoiceId,
        invoice_no: result.invoiceNo,
        status: result.completed ? "completed" : "pending",
        scanned_qty: result.scannedQty,
        total_qty: result.totalQty,
        completed_at: result.completedAt,
      },
    });
  } catch (error) {
    console.error("수동 챙김 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
