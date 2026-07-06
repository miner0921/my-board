import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/scan/complete
// 결품 완료(partial). 사유 + 메모(10자 이상) 필수.
// 진행률 0% 송장은 거부 (아무것도 안 챙긴 송장 결품 완료 차단).
// ─────────────────────────────────────────────────────────────

const ALLOWED_REASONS = new Set([
  "out_of_stock",
  "customer_cancel",
  "damaged",
  "other",
]);

type Body = {
  invoice_id?: unknown;
  reason?: unknown;
  note?: unknown;
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
    const reason =
      typeof body.reason === "string" && ALLOWED_REASONS.has(body.reason)
        ? body.reason
        : null;
    const noteRaw =
      typeof body.note === "string" ? body.note.trim() : "";
    // 빈 메모는 NULL로 저장 (선택사항)
    const note: string | null = noteRaw.length > 0 ? noteRaw : null;

    if (!invoiceId || !reason) {
      return NextResponse.json(
        { error: "invoice_id와 reason은 필수입니다." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 송장 락
      const invRes = await client.query(
        `SELECT id, invoice_no, status FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId]
      );
      if (invRes.rows.length === 0) {
        return { kind: "not_found" as const };
      }
      const inv = invRes.rows[0];
      if (inv.status === "completed" || inv.status === "completed_partial") {
        return { kind: "already_completed" as const };
      }

      // 진행률 확인 (0이면 거부) — 제외 품목 + 스캔불필요 품목은 집계에서 뺀다.
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(scanned_count), 0)::int AS scanned,
                COALESCE(SUM(quantity), 0)::int      AS total
           FROM invoice_items
          WHERE invoice_id = $1 AND excluded_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM items ix
               WHERE ix.id = invoice_items.item_id AND ix.inspection_exempt
            )`,
        [invoiceId]
      );
      const scanned = sumRes.rows[0]?.scanned ?? 0;
      const total = sumRes.rows[0]?.total ?? 0;
      if (scanned <= 0) {
        return { kind: "zero_progress" as const };
      }

      // 결품 완료 처리
      const upd = await client.query(
        `UPDATE invoices
            SET status = 'completed_partial',
                completed_at = NOW(),
                completed_by = $1,
                completion_reason = $2,
                completion_note  = $3
          WHERE id = $4
          RETURNING completed_at`,
        [userId, reason, note, invoiceId]
      );

      return {
        kind: "ok" as const,
        invoice_no: inv.invoice_no as string,
        completed_at: upd.rows[0].completed_at as string,
        scanned,
        total,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { type: "partial_not_found", message: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "already_completed") {
      return NextResponse.json(
        {
          type: "partial_already_completed",
          message: "이미 완료된 송장입니다.",
        },
        { status: 409 }
      );
    }
    if (result.kind === "zero_progress") {
      return NextResponse.json(
        {
          type: "partial_zero_progress",
          message:
            "한 건도 스캔하지 않은 송장은 결품 완료할 수 없습니다.",
        },
        { status: 409 }
      );
    }

    await logAccess({
      session,
      action: "invoice.complete_partial",
      targetType: "invoice",
      targetId: invoiceId,
      request,
    });

    return NextResponse.json({
      type: "partial_complete",
      invoice: {
        id: invoiceId,
        invoice_no: result.invoice_no,
        status: "completed_partial",
        completed_at: result.completed_at,
        completion_reason: reason,
        completion_note: note,
        scanned_qty: result.scanned,
        total_qty: result.total,
      },
    });
  } catch (error) {
    console.error("결품 완료 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
