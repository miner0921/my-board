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

// POST: 삭제된 등록건(batch) 복구 (로그인 작업자 전원).
//   - batch.deleted_at NULL + 그 batch의 삭제된 invoices 일괄 복구.
//   - 검수/목록/진행률에 다시 정상 노출.
export async function POST(request: Request, { params }: RouteContext) {
  const r = await requireUser();
  if (!r.ok) return r.response;

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
      if (!sel.rows[0].deleted_at) {
        throw new HttpError(409, "삭제되지 않은 등록건입니다.");
      }

      const inv = await client.query(
        `UPDATE invoices
            SET deleted_at = NULL, deleted_by = NULL
          WHERE upload_batch_id = $1 AND deleted_at IS NOT NULL
          RETURNING id`,
        [batchId]
      );
      await client.query(
        `UPDATE upload_batches
            SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
          WHERE id = $1`,
        [batchId]
      );
      return inv.rows.map((x) => x.id as number);
    });

    for (const iid of invoiceIds) {
      await logAccess({
        session: r.session,
        action: "invoice.restore",
        targetType: "invoice",
        targetId: iid,
        request,
      });
    }
    await logAccess({
      session: r.session,
      action: "upload_batch.restore",
      targetType: "upload_batch",
      targetId: batchId,
      request,
    });

    return NextResponse.json({ ok: true, affected: invoiceIds.length });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("등록건 복구 에러:", e);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
