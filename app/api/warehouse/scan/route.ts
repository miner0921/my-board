import { NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";
import { parseProductName } from "@/lib/parse-product";
import { loadItemIndex } from "@/lib/resolve-item";

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
         LEFT JOIN invoice_items ii
           ON ii.invoice_id = i.id AND ii.excluded_at IS NULL
        WHERE i.invoice_no = $1 AND i.deleted_at IS NULL
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
             LEFT JOIN invoice_items ii
               ON ii.invoice_id = i.id AND ii.excluded_at IS NULL
            WHERE i.id = $1 AND i.deleted_at IS NULL
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
        rawLines: startPayload.rawLines,
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
      // 송장 락 (먼저, 데드락 방지 — 항상 invoices → invoice_items 순서)
      const invSelRes = await client.query(
        `SELECT id, status, completed_at, completed_by,
                completion_reason, completion_note
           FROM invoices
          WHERE id = $1
          FOR UPDATE`,
        [currentInvoiceId]
      );
      if (invSelRes.rows.length === 0) {
        return { kind: "invoice_missing" as const };
      }
      const invRow = invSelRes.rows[0] as {
        id: number;
        status: string;
        completed_at: string | null;
        completed_by: number | null;
        completion_reason: string | null;
        completion_note: string | null;
      };
      const isInvoiceDone =
        invRow.status === "completed" ||
        invRow.status === "completed_partial";

      // 자동 재개 helper — 완료된 송장에 force=true로 추가 시 호출.
      //   invoice_reopens에 이력 + invoices 완료 필드 NULL 처리.
      const triggerAutoReopen = async (): Promise<boolean> => {
        if (!isInvoiceDone) return false;
        await client.query(
          `INSERT INTO invoice_reopens
             (invoice_id, reopened_by, reason,
              prev_status, prev_completion_reason, prev_completion_note,
              prev_completed_at, prev_completed_by)
           VALUES ($1, $2, '수량 추가로 자동 재개', $3, $4, $5, $6, $7)`,
          [
            currentInvoiceId,
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
              SET status = 'pending',
                  completed_at = NULL,
                  completed_by = NULL,
                  completion_reason = NULL,
                  completion_note = NULL
            WHERE id = $1`,
          [currentInvoiceId]
        );
        return true;
      };

      // 품목 행 락 (+ 바코드/이름 — 송장 기반 바코드 매칭에 사용)
      // 제외된 품목(excluded_at)은 매칭/진행률/완료 판정 모두에서 빠진다.
      const rowsRes = await client.query(
        `SELECT ii.id AS invoice_item_id, ii.item_id, ii.quantity, ii.scanned_count,
                it.name AS item_name, it.barcode AS item_barcode, it.scan_exempt
           FROM invoice_items ii
           JOIN items it ON it.id = ii.item_id
          WHERE ii.invoice_id = $1 AND ii.excluded_at IS NULL
          FOR UPDATE OF ii`,
        [currentInvoiceId]
      );
      const rows: Array<{
        invoice_item_id: number;
        item_id: number;
        quantity: number;
        scanned_count: number;
        item_name: string;
        item_barcode: string | null;
        scan_exempt: boolean;
      }> = rowsRes.rows;

      // 송장 기반 매칭: 스캔한 바코드를 "현재 송장 품목" 중에서 찾는다.
      // 같은 바코드 품목이 여럿이면 아직 안 찍힌 것(scanned_count < quantity) 우선,
      // 모두 다 찍혔으면 그 중 첫 번째(초과 확인 흐름으로).
      const candidates = rows.filter((r) => r.item_barcode === barcode);
      const target =
        candidates.find((r) => r.scanned_count < r.quantity) ?? candidates[0];

      // 송장에 없는 품목
      if (!target) {
        // force=true → 현장 추가로 invoice_items에 새 행 INSERT
        if (force) {
          // 완료된 송장이면 먼저 자동 재개
          const autoReopened = await triggerAutoReopen();

          // 같은 품목이 이전에 "제외"되어 행이 남아 있으면 UNIQUE(invoice_id,item_id)
          // 충돌 → 새로 만들지 않고 그 행을 복구(excluded 해제)하며 +1.
          // 신규면 1/1 로 INSERT. 어느 쪽이든 RETURNING 실제 값으로 진행률 계산.
          const ins = await client.query(
            `INSERT INTO invoice_items
               (invoice_id, item_id, quantity, scanned_count, display_name, is_added_on_scan)
             VALUES ($1, $2, 1, 1, $3, TRUE)
             ON CONFLICT (invoice_id, item_id) DO UPDATE
               SET scanned_count = invoice_items.scanned_count + 1,
                   excluded_at = NULL, excluded_by = NULL, exclude_reason = NULL
             RETURNING id AS invoice_item_id, quantity, scanned_count, is_added_on_scan`,
            [currentInvoiceId, matchedItem.id, matchedItem.name]
          );
          const newRow = ins.rows[0] as {
            invoice_item_id: number;
            quantity: number;
            scanned_count: number;
            is_added_on_scan: boolean;
          };
          const newInvoiceItemId = newRow.invoice_item_id;

          // 카드 그리드 표시용 items 정보
          const itemInfo = await client.query(
            `SELECT barcode, updated_at,
                    (image_data IS NOT NULL) AS has_image
               FROM items WHERE id = $1`,
            [matchedItem.id]
          );

          // 첫 스캔 시점 기록 (NULL일 때만)
          await client.query(
            `UPDATE invoices
                SET scan_started_at = COALESCE(scan_started_at, NOW()),
                    scan_started_by = COALESCE(scan_started_by, $1)
              WHERE id = $2`,
            [userId, currentInvoiceId]
          );

          // 의도적 추가라 is_error=false. 추적용으로 reason은 남김.
          //   quantity: 현장 추가 이벤트의 변화량 = +1.
          await client.query(
            `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason, quantity)
             VALUES ($1, $2, $3, false, 'wrong_item_added', 1)`,
            [currentInvoiceId, matchedItem.id, userId]
          );

          // 새(또는 복구된) 행을 포함한 진행률 재계산 — RETURNING 실제 값 사용
          const newRows = [
            ...rows,
            {
              invoice_item_id: newInvoiceItemId,
              item_id: matchedItem.id,
              quantity: newRow.quantity,
              scanned_count: newRow.scanned_count,
              item_name: matchedItem.name as string,
              item_barcode: null,
              scan_exempt: false,
            },
          ];
          // 완료 판정은 모든 품목 기준 (동봉 포함 — 검수 제외 없음)
          const totalQty = newRows.reduce((s, r) => s + r.quantity, 0);
          const scannedQty = newRows.reduce(
            (s, r) => s + Math.min(r.scanned_count, r.quantity),
            0
          );
          const allFilled =
            newRows.length > 0 &&
            newRows.every((r) => r.scanned_count >= r.quantity);

          let completedAt: string | null = null;
          if (allFilled) {
            const upd = await client.query(
              `UPDATE invoices
                  SET status = 'completed',
                      completed_at = NOW(),
                      completed_by = $1,
                      completion_reason = 'full'
                WHERE id = $2
                  AND status <> 'completed'
                  AND status <> 'completed_partial'
                RETURNING completed_at`,
              [userId, currentInvoiceId]
            );
            if (upd.rows.length > 0) {
              completedAt = upd.rows[0].completed_at;
            }
          }

          return {
            kind: allFilled && completedAt
              ? ("force_added_complete" as const)
              : ("force_added" as const),
            autoReopened,
            newItem: {
              invoice_item_id: newInvoiceItemId,
              item_id: matchedItem.id,
              name: matchedItem.name as string,
              display_name: matchedItem.name as string,
              quantity: newRow.quantity,
              scanned_count: newRow.scanned_count,
              barcode: itemInfo.rows[0]?.barcode ?? null,
              updated_at: itemInfo.rows[0]?.updated_at ?? new Date().toISOString(),
              has_image: itemInfo.rows[0]?.has_image ?? false,
              is_added_on_scan: newRow.is_added_on_scan,
            },
            invoice: {
              id: currentInvoiceId,
              scanned_qty: scannedQty,
              total_qty: totalQty,
              completed_at: completedAt,
            },
          };
        }

        // force=false → 기존 경고
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

      // 카운트 +1 처리 — 초과 / 완료 송장 추가는 사용자 확인을 받는다.
      const nextCount = target.scanned_count + 1;
      const willBeOver = nextCount > target.quantity;

      // 사용자 확인이 필요한 경우:
      //   1) quantity 초과 (일반 over)
      //   2) 완료/부분완료 송장에 추가 스캔 (자동 재개 사전 확인)
      const needsConfirm = !force && (willBeOver || isInvoiceDone);

      if (needsConfirm) {
        return {
          kind: "over_confirm" as const,
          item: {
            invoice_item_id: target.invoice_item_id,
            item_id: target.item_id,
            name: target.item_name,
            quantity: target.quantity,
            scanned_count: target.scanned_count, // 변경 전 값
          },
        };
      }

      // 여기서부터: 정상 카운트(+1) 또는 force=true로 강제 +1
      // 완료 송장이면 자동 재개 먼저
      const autoReopened = await triggerAutoReopen();
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

      // scan_log — 정상이든 강제 over든 사용자 의도이므로 is_error=false.
      //   reason: 강제 over면 'over_quantity_forced', 정상이면 NULL.
      //   quantity: 이 스캔의 변화량 = +1 (정상·초과 모두 한 번에 1개).
      await client.query(
        `INSERT INTO scan_logs (invoice_id, item_id, user_id, is_error, error_reason, quantity)
         VALUES ($1, $2, $3, false, $4, 1)`,
        [
          currentInvoiceId,
          target.item_id,
          userId,
          willBeOver ? "over_quantity_forced" : null,
        ]
      );

      // 완료 판정 — 락이 걸린 메모리 값으로 합계 계산
      const updatedRows = rows.map((r) =>
        r.invoice_item_id === target.invoice_item_id
          ? { ...r, scanned_count: nextCount }
          : r
      );
      // 완료 판정은 모든 품목 기준 (동봉 포함 — 검수 제외 없음)
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
              SET status = 'completed',
                  completed_at = NOW(),
                  completed_by = $1,
                  completion_reason = 'full'
            WHERE id = $2
              AND status <> 'completed'
              AND status <> 'completed_partial'
            RETURNING completed_at`,
          [userId, currentInvoiceId]
        );
        if (upd.rows.length > 0) {
          completedAt = upd.rows[0].completed_at;
        }
      }

      return {
        kind: allFilled && completedAt
          ? ("complete" as const)
          : willBeOver
            ? ("over_forced" as const)
            : ("ok" as const),
        autoReopened,
        item: {
          invoice_item_id: target.invoice_item_id,
          item_id: target.item_id,
          name: target.item_name,
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

    if (result.kind === "invoice_missing") {
      return NextResponse.json(
        { type: "scan_unknown", message: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (result.kind === "wrong_item") {
      return NextResponse.json({
        type: "scan_wrong_item",
        item: { name: result.itemName },
        message: `이 품목은 다른 송장의 품목입니다. 현장에서 추가하거나 [취소] 후 해당 송장을 먼저 스캔하세요.`,
      });
    }

    if (result.kind === "force_added" || result.kind === "force_added_complete") {
      await logAccess({
        session,
        action: "invoice.item_force_added",
        targetType: "invoice",
        targetId: result.invoice.id,
        request,
      });
      if (result.autoReopened) {
        await logAccess({
          session,
          action: "invoice.auto_reopened",
          targetType: "invoice",
          targetId: result.invoice.id,
          request,
        });
      }

      // 완료까지 트리거됐으면 invoice_complete로 통합 응답
      if (result.kind === "force_added_complete") {
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
          auto_reopened: result.autoReopened,
          // 신규 현장 추가 품목 → 카드 렌더링용 전체 필드를 그대로 전송.
          // (클라이언트가 배열에 없으면 카드를 추가하도록 upsert 처리)
          item: result.newItem,
          invoice: {
            id: result.invoice.id,
            invoice_no: noRes.rows[0]?.invoice_no ?? null,
            status: "completed",
            scanned_qty: result.invoice.scanned_qty,
            total_qty: result.invoice.total_qty,
            completed_at: result.invoice.completed_at,
          },
        });
      }

      return NextResponse.json({
        type: "scan_force_added",
        auto_reopened: result.autoReopened,
        item: result.newItem,
        invoice: {
          id: result.invoice.id,
          status: "pending",
          scanned_qty: result.invoice.scanned_qty,
          total_qty: result.invoice.total_qty,
        },
      });
    }

    if (result.kind === "complete") {
      // 완료 송장의 invoice_no 다시 한 번 조회 (응답 표시용)
      const noRes = await query(
        `SELECT invoice_no FROM invoices WHERE id = $1`,
        [result.invoice.id]
      );
      if (result.autoReopened) {
        await logAccess({
          session,
          action: "invoice.auto_reopened",
          targetType: "invoice",
          targetId: result.invoice.id,
          request,
        });
      }
      await logAccess({
        session,
        action: "invoice.complete",
        targetType: "invoice",
        targetId: result.invoice.id,
        request,
      });
      return NextResponse.json({
        type: "invoice_complete",
        auto_reopened: result.autoReopened,
        item: result.item,
        invoice: {
          id: result.invoice.id,
          invoice_no: noRes.rows[0]?.invoice_no ?? null,
          status: "completed",
          scanned_qty: result.invoice.scanned_qty,
          total_qty: result.invoice.total_qty,
          completed_at: result.invoice.completed_at,
        },
      });
    }

    if (result.kind === "over_confirm") {
      return NextResponse.json({
        type: "scan_over_quantity_confirm",
        item: result.item,
        message: "이미 수량만큼 챙긴 품목입니다.",
      });
    }

    if (result.kind === "over_forced") {
      if (result.autoReopened) {
        await logAccess({
          session,
          action: "invoice.auto_reopened",
          targetType: "invoice",
          targetId: result.invoice.id,
          request,
        });
      }
      return NextResponse.json({
        type: "scan_over_quantity_forced",
        auto_reopened: result.autoReopened,
        item: result.item,
        invoice: {
          id: result.invoice.id,
          status: "pending",
          scanned_qty: result.invoice.scanned_qty,
          total_qty: result.invoice.total_qty,
        },
      });
    }

    // ok
    if (result.autoReopened) {
      await logAccess({
        session,
        action: "invoice.auto_reopened",
        targetType: "invoice",
        targetId: result.invoice.id,
        request,
      });
    }
    return NextResponse.json({
      type: "scan_ok",
      auto_reopened: result.autoReopened,
      item: result.item,
      invoice: {
        id: result.invoice.id,
        status: "pending",
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

// invoice_start 응답용 — 송장 핵심 정보 + 품목 목록 + 원문 라인.
// 검수 화면은 바코드 작업이라 수령인 정보는 보내지 않는다.
// rawLines: "전체 상품" 표시용 — 송장 원문(raw_product_name)을 파싱한 라인 그대로.
//   별칭으로 매칭이 합쳐져도 원문 라인은 분리 유지. 각 라인에 매핑 item_id를 붙여
//   완료/제외 상태는 클라이언트의 live items(품목 단위)에서 끌어온다.
async function loadInvoiceFull(invoiceId: number): Promise<{
  invoice: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  rawLines: Array<{ rawName: string; qty: number; item_id: number | null }>;
} | null> {
  const [invRes, itemsRes] = await Promise.all([
    query(
      `SELECT
         i.id, i.invoice_no, i.order_no, i.status,
         i.customer_type, i.created_at, i.raw_product_name, i.admin_memo,
         i.recipient_name, i.recipient_phone, i.recipient_address,
         COALESCE(SUM(ii.quantity), 0)::int       AS total_qty,
         COALESCE(SUM(ii.scanned_count), 0)::int  AS scanned_qty,
         (SELECT r.reason FROM invoice_reopens r
           WHERE r.invoice_id = i.id AND r.is_manual AND r.reason IS NOT NULL
           ORDER BY r.reopened_at DESC LIMIT 1)    AS reopen_reason
       FROM invoices i
       LEFT JOIN invoice_items ii
         ON ii.invoice_id = i.id AND ii.excluded_at IS NULL
       WHERE i.id = $1 AND i.deleted_at IS NULL
       GROUP BY i.id`,
      [invoiceId]
    ),
    // 제외(취소)된 품목도 함께 실어보낸다 — "전체 상품"(OrderText)에서 "(취소)"로
    //   보여주기 위함. 카드/진행률은 클라이언트가 excluded 플래그로 걸러낸다.
    //   (진행률 집계는 위 invoice 쿼리가 excluded_at IS NULL 로 이미 제외 — 영향 없음)
    query(
      `SELECT
         ii.id AS invoice_item_id,
         ii.item_id, ii.quantity, ii.scanned_count, ii.display_name,
         (ii.excluded_at IS NOT NULL) AS excluded,
         ii.is_added_on_scan,
         it.name, it.barcode, it.updated_at, it.scan_exempt,
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

  // 원문 라인 분해 — 송장 원문을 파싱해 라인별로(별칭 합산 전) 유지.
  // 각 라인의 정규화 품명을 별칭 인덱스로 item_id에 역매핑(매칭과 동일 규칙).
  const rawText = (raw.raw_product_name as string | null) ?? "";
  let rawLines: Array<{ rawName: string; qty: number; item_id: number | null }> =
    [];
  if (rawText.trim() !== "") {
    const index = await loadItemIndex(query);
    rawLines = parseProductName(rawText).items.map((it) => ({
      rawName: it.rawName,
      qty: it.qty,
      item_id: index.get(it.normalizedName) ?? null,
    }));
  }

  return {
    invoice: {
      id: raw.id,
      invoice_no: raw.invoice_no,
      order_no: raw.order_no,
      status: raw.status,
      customer_type: raw.customer_type,
      recipient_name: raw.recipient_name,
      recipient_phone: raw.recipient_phone,
      recipient_address: raw.recipient_address,
      total_qty: raw.total_qty,
      scanned_qty: raw.scanned_qty,
      admin_memo: raw.admin_memo,
      reopen_reason: raw.reopen_reason,
    },
    items: itemsRes.rows,
    rawLines,
  };
}
