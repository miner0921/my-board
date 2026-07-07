import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/scan/exclude
// 검수 중 송장에서 품목을 제외(빼기) / 복구.
// body: { invoice_id, invoice_item_id, action: "exclude"|"restore", reason? }
//
// 제외(exclude):
//   - invoice_items.excluded_at/by/reason 세팅 (행은 보존, 진행률/완료에서만 제외)
//   - scanned_count / scan_logs 는 그대로 → 이미 챙긴 기록 보존
//   - 제외 후 남은 품목으로 진행률·완료 재판정 (남은 게 다 채워지면 자동 완료)
//   - 완료 송장에서 제외는 미완료로 만들지 않으므로 자동 재개(reopen) 불필요
//
// 복구(restore):
//   - 세 컬럼 NULL 로
//   - 완료 송장에 품목이 되살아나 미완료가 되면 기존 흐름대로 자동 재개(invoice_reopens)
//
// 권한: 로그인한 누구나 (force-add 와 동일 정책 — 역할 분기 없음)
// 응답: 스캔 API 와 동일 형태(scan_ok / invoice_complete)로 클라이언트 재사용.
// ─────────────────────────────────────────────────────────────

type Body = {
  invoice_id?: unknown;
  invoice_item_id?: unknown;
  action?: unknown;
  reason?: unknown;
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
    const action =
      body.action === "restore" ? "restore" : body.action === "exclude" ? "exclude" : null;
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
    // 사유는 선택. 너무 길면 컬럼(200) 안에서 자른다.
    const reason: string | null =
      reasonRaw.length > 0 ? reasonRaw.slice(0, 200) : null;

    if (!invoiceId || !invoiceItemId || !action) {
      return NextResponse.json(
        { error: "invoice_id, invoice_item_id, action(exclude|restore)이 필요합니다." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 송장 락 (invoices → invoice_items 순서로 데드락 방지)
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

      // 대상 행 + 전체 행 잠금 (제외 상태 포함해서 가져옴)
      const rowsRes = await client.query(
        `SELECT ii.id AS invoice_item_id, ii.item_id, ii.quantity, ii.scanned_count,
                ii.excluded_at, it.name AS item_name, it.inspection_exempt
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
        excluded_at: string | null;
        item_name: string;
        inspection_exempt: boolean;
      }> = rowsRes.rows;
      const target = rows.find((r) => r.invoice_item_id === invoiceItemId);
      if (!target) return { kind: "item_missing" as const };

      // 멱등 체크 — 이미 원하는 상태면 그대로 통과(상태만 재계산)
      const alreadyExcluded = target.excluded_at !== null;

      if (action === "exclude") {
        if (!alreadyExcluded) {
          await client.query(
            `UPDATE invoice_items
                SET excluded_at = NOW(), excluded_by = $1, exclude_reason = $2
              WHERE id = $3`,
            [userId, reason, invoiceItemId]
          );
          // quantity: 취소된 수량 = 그 순간 챙겨져 있던 scanned_count.
          await client.query(
            `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason, quantity)
             VALUES ($1, $2, $3, false, 'item_excluded', $4)`,
            [invoiceId, target.item_id, userId, target.scanned_count]
          );
        }
        target.excluded_at = "now"; // 아래 재계산에서 제외로 취급
      } else {
        // restore
        if (alreadyExcluded) {
          await client.query(
            `UPDATE invoice_items
                SET excluded_at = NULL, excluded_by = NULL, exclude_reason = NULL
              WHERE id = $1`,
            [invoiceItemId]
          );
          // quantity: 복구된 수량 = 보존돼 있던 scanned_count.
          await client.query(
            `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason, quantity)
             VALUES ($1, $2, $3, false, 'item_restored', $4)`,
            [invoiceId, target.item_id, userId, target.scanned_count]
          );
        }
        target.excluded_at = null; // 재계산에서 다시 포함
      }

      // ── 진행률/완료 재판정 — 제외(취소)·스캔불필요 품목을 모두 뺀 활성 품목만 기준 ──
      const activeRows = rows.filter(
        (r) => r.excluded_at === null && !r.inspection_exempt
      );
      const totalQty = activeRows.reduce((s, r) => s + r.quantity, 0);
      const scannedQty = activeRows.reduce(
        (s, r) => s + Math.min(r.scanned_count, r.quantity),
        0
      );
      const allFilled =
        activeRows.length > 0 &&
        activeRows.every((r) => r.scanned_count >= r.quantity);

      let autoReopened = false;
      let completedAt: string | null = null;

      if (action === "restore" && isInvoiceDone && !allFilled) {
        // 복구로 다시 미완료가 된 완료 송장 → 자동 재개 (스캔 흐름과 동일)
        await client.query(
          `INSERT INTO invoice_reopens
             (invoice_id, reopened_by, reason,
              prev_status, prev_completion_reason, prev_completion_note,
              prev_completed_at, prev_completed_by)
           VALUES ($1, $2, '품목 복구로 자동 재개', $3, $4, $5, $6, $7)`,
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
      } else if (action === "exclude" && allFilled && !isInvoiceDone) {
        // 제외 결과 남은 품목이 전부 채워졌으면 자동 완료
        const upd = await client.query(
          `UPDATE invoices
              SET status = 'completed', completed_at = NOW(),
                  completed_by = $1, completion_reason = 'full'
            WHERE id = $2 AND status <> 'completed' AND status <> 'completed_partial' AND status <> 'manual_completed'
            RETURNING completed_at`,
          [userId, invoiceId]
        );
        if (upd.rows.length > 0) completedAt = upd.rows[0].completed_at;
      }

      // 처리 후 송장의 실제 상태를 명확히 계산한다.
      //   - 자동 완료됨            → completed
      //   - 자동 재개됨            → pending
      //   - 그 외 이미 완료/부분완료 → 기존 상태 유지(제외는 완료를 깨지 않음)
      //   - 그 외                   → pending
      const finalStatus = completedAt
        ? "completed"
        : autoReopened
          ? "pending"
          : isInvoiceDone
            ? invRow.status
            : "pending";
      // 풀 완료(=완료 배너)만 invoice_complete 로 응답
      const completed = finalStatus === "completed";

      return {
        kind: "ok" as const,
        autoReopened,
        invoiceNo: invRow.invoice_no,
        item: {
          invoice_item_id: target.invoice_item_id,
          item_id: target.item_id,
          name: target.item_name,
          quantity: target.quantity,
          scanned_count: target.scanned_count,
          excluded: action === "exclude",
        },
        scannedQty,
        totalQty,
        finalStatus,
        completed,
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

    await logAccess({
      session,
      action: action === "exclude" ? "invoice.item_excluded" : "invoice.item_restored",
      targetType: "invoice",
      targetId: invoiceId,
      request,
    });
    if (result.autoReopened) {
      await logAccess({
        session,
        action: "invoice.auto_reopened",
        targetType: "invoice",
        targetId: invoiceId,
        request,
      });
    }
    if (result.completed && action === "exclude") {
      await logAccess({
        session,
        action: "invoice.complete",
        targetType: "invoice",
        targetId: invoiceId,
        request,
      });
    }

    // 화면 캐시 무효화만 (검수·매칭·진행률 로직 불변)
    revalidatePath(`/warehouse/invoices/${invoiceId}`);
    revalidatePath("/warehouse/invoices");

    return NextResponse.json({
      type: result.completed ? "invoice_complete" : "scan_ok",
      action,
      auto_reopened: result.autoReopened,
      item: result.item,
      invoice: {
        id: invoiceId,
        invoice_no: result.invoiceNo,
        status: result.finalStatus,
        scanned_qty: result.scannedQty,
        total_qty: result.totalQty,
        completed_at: result.completedAt,
      },
    });
  } catch (error) {
    console.error("품목 제외/복구 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
