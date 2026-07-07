import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { auth } from "@/auth";
import { logAccess } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/invoices/manual-complete
// 대기(pending) 송장을 스캔 없이 "수동완료"(manual_completed)로 처리.
// 단건({ invoice_id }) · 다건({ ids: number[] }) 모두 지원.
//
// - 로그인한 작업자 전원 가능(role 체크 없음) — completed_by에 처리자 id 기록.
// - 진행률(scanned_count 등)은 건드리지 않는다. 0/N 그대로 둔다.
// - pending + deleted_at IS NULL 인 건만 처리. 그 외(이미 완료/삭제/없음)는 스킵.
// - completed_at 은 반드시 NOW() — 완료 탭 정렬축·인덱스가 completed_at 기반.
// ─────────────────────────────────────────────────────────────

type Body = {
  invoice_id?: unknown;
  ids?: unknown;
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

    // 단건(invoice_id) · 다건(ids) 을 하나의 정수 배열로 정규화(중복 제거).
    const rawIds: unknown[] = [];
    if (typeof body.invoice_id === "number") rawIds.push(body.invoice_id);
    if (Array.isArray(body.ids)) rawIds.push(...body.ids);
    const ids = Array.from(
      new Set(
        rawIds
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    );

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "대상 송장을 선택해주세요." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 대상 락 + 현재 상태 확인(스킵 사유 분류용).
      const selRes = await client.query(
        `SELECT id, status, (deleted_at IS NOT NULL) AS deleted
           FROM invoices
          WHERE id = ANY($1::int[])
          FOR UPDATE`,
        [ids]
      );

      const found = new Map<
        number,
        { status: string; deleted: boolean }
      >();
      for (const row of selRes.rows) {
        found.set(Number(row.id), {
          status: row.status as string,
          deleted: row.deleted as boolean,
        });
      }

      // 스킵 분류: 없음 / 삭제됨 / 대기 아님(이미 완료 등).
      const eligible: number[] = [];
      const skipped: Array<{ id: number; reason: string }> = [];
      for (const id of ids) {
        const f = found.get(id);
        if (!f) {
          skipped.push({ id, reason: "not_found" });
        } else if (f.deleted) {
          skipped.push({ id, reason: "deleted" });
        } else if (f.status !== "pending") {
          skipped.push({ id, reason: "not_pending" });
        } else {
          eligible.push(id);
        }
      }

      // 대기 건만 수동완료로 갱신 — WHERE에 pending/deleted 조건을 한 번 더 박아
      // 락 이후 경합 상황에서도 안전(오직 대기 송장만 변경).
      let completedIds: number[] = [];
      if (eligible.length > 0) {
        const upd = await client.query(
          `UPDATE invoices
              SET status = 'manual_completed',
                  completed_at = NOW(),
                  completed_by = $2,
                  completion_reason = 'manual'
            WHERE id = ANY($1::int[])
              AND status = 'pending'
              AND deleted_at IS NULL
            RETURNING id`,
          [eligible, userId]
        );
        completedIds = upd.rows.map((r) => Number(r.id));
      }

      // 혹시 eligible 이었으나 경합으로 갱신 안 된 건은 스킵으로 흡수.
      const completedSet = new Set(completedIds);
      for (const id of eligible) {
        if (!completedSet.has(id)) {
          skipped.push({ id, reason: "not_pending" });
        }
      }

      return { completedIds, skipped };
    });

    // 실제로 완료된 건만 감사 로그(누가·언제·무엇) — invoice.complete 와 동일 방식.
    for (const id of result.completedIds) {
      await logAccess({
        session,
        action: "invoice.manual_complete",
        targetType: "invoice",
        targetId: id,
        request,
      });
    }

    // 목록(상태 탭 이동) 캐시 무효화.
    revalidatePath("/warehouse/invoices");

    return NextResponse.json({
      ok: true,
      completed: result.completedIds.length,
      completed_ids: result.completedIds,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("수동완료 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
