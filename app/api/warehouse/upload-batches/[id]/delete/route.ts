import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

// POST: 등록건(batch) 통째 삭제 — soft delete (로그인 작업자 전원).
//   - 그 batch의 invoices를 일괄 soft delete + batch.deleted_at SET.
//   - ★ hard delete 절대 안 함. scan_logs/invoice_items/upload_files 보존.
//   - deleted_at 필터로 검수/목록/진행률에서 제외, 복구 가능.
export async function POST(request: Request, { params }: RouteContext) {
  const r = await requireUser();
  if (!r.ok) return r.response;
  const userId = Number(r.session.user.id);

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "잘못된 id 입니다." }, { status: 400 });
  }

  try {
    const invoiceIds = await withTransaction(async (client) => {
      const sel = await client.query(
        `SELECT deleted_at FROM upload_batches WHERE id = $1 FOR UPDATE`,
        [batchId]
      );
      if (sel.rows.length === 0) {
        throw new HttpError(404, "등록건을 찾을 수 없습니다.");
      }
      if (sel.rows[0].deleted_at) {
        throw new HttpError(409, "이미 삭제된 등록건입니다.");
      }

      // 그 batch의 활성 송장 일괄 soft delete
      const inv = await client.query(
        `UPDATE invoices
            SET deleted_at = NOW(), deleted_by = $2
          WHERE upload_batch_id = $1 AND deleted_at IS NULL
          RETURNING id`,
        [batchId, userId]
      );
      // batch 자체도 삭제 표시
      await client.query(
        `UPDATE upload_batches
            SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
          WHERE id = $1`,
        [batchId, userId]
      );
      return inv.rows.map((x) => x.id as number);
    });

    // 감사 로그: 송장 건별 + 등록건
    for (const iid of invoiceIds) {
      await logAccess({
        session: r.session,
        action: "invoice.hide",
        targetType: "invoice",
        targetId: iid,
        request,
      });
    }
    await logAccess({
      session: r.session,
      action: "upload_batch.delete",
      targetType: "upload_batch",
      targetId: batchId,
      request,
    });

    return NextResponse.json({ ok: true, affected: invoiceIds.length });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("등록건 삭제 에러:", e);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
