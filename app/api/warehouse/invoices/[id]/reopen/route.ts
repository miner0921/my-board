import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";
import { isCompletedStatus } from "@/lib/invoice-status";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/invoices/[id]/reopen
// 완료 상태(completed / completed_partial / manual_completed) 송장을 다시 pending으로.
// 로그인한 작업자 전원 가능 — reopened_by에 재개한 사람 id가 남아 추적된다.
// reason 은 선택 (빈 값이면 NULL 저장).
// 재개 직전 상태는 invoice_reopens에 prev_* 로 보존.
// invoice_items.scanned_count / is_added_on_scan / invoices.scan_started_at 은 보존.
// ─────────────────────────────────────────────────────────────

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Body = { reason?: unknown };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    const userId = Number(session.user.id);

    const { id } = await params;
    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId)) {
      return NextResponse.json(
        { error: "잘못된 송장 ID입니다." },
        { status: 400 }
      );
    }

    const body: Body = await request.json().catch(() => ({}));
    const reasonRaw =
      typeof body.reason === "string" ? body.reason.trim() : "";
    // 빈 사유는 NULL로 저장 (선택사항).
    // 자동 재개는 "수량 추가로 자동 재개" 텍스트로 채워지므로
    // NULL 행 = "사용자 수동 재개 + 사유 없음" 케이스로 식별.
    const reason: string | null = reasonRaw.length > 0 ? reasonRaw : null;

    const result = await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, invoice_no, status,
                completed_at, completed_by,
                completion_reason, completion_note
           FROM invoices
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [invoiceId]
      );
      if (invRes.rows.length === 0) {
        return { kind: "not_found" as const };
      }
      const inv = invRes.rows[0];
      if (!isCompletedStatus(inv.status)) {
        return { kind: "not_completed" as const };
      }

      // 재개 이력 기록 — 이전 상태 모두 캡처. 수동(관리자) 재개라 is_manual=true.
      await client.query(
        `INSERT INTO invoice_reopens
           (invoice_id, reopened_by, reason, is_manual,
            prev_status, prev_completion_reason, prev_completion_note,
            prev_completed_at, prev_completed_by)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)`,
        [
          invoiceId,
          userId,
          reason,
          inv.status,
          inv.completion_reason,
          inv.completion_note,
          inv.completed_at,
          inv.completed_by,
        ]
      );

      // 송장 재개 — 완료 관련 필드만 초기화. scan_started_* 는 보존.
      await client.query(
        `UPDATE invoices
            SET status = 'pending',
                completed_at = NULL,
                completed_by = NULL,
                completion_reason = NULL,
                completion_note = NULL
          WHERE id = $1`,
        [invoiceId]
      );

      return {
        kind: "ok" as const,
        invoice_no: inv.invoice_no as string,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "not_completed") {
      return NextResponse.json(
        {
          type: "reopen_not_completed",
          message: "완료되지 않은 송장은 재개할 수 없습니다.",
        },
        { status: 409 }
      );
    }

    await logAccess({
      session,
      action: "invoice.reopen",
      targetType: "invoice",
      targetId: invoiceId,
      request,
    });

    // 목록(상태 탭 이동) + 상세 화면 캐시 무효화 (다음 조회 시 새로 렌더)
    revalidatePath("/warehouse/invoices");
    revalidatePath(`/warehouse/invoices/${invoiceId}`);

    return NextResponse.json({
      type: "reopened",
      invoice: {
        id: invoiceId,
        invoice_no: result.invoice_no,
        status: "pending",
      },
    });
  } catch (error) {
    console.error("송장 재개 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
