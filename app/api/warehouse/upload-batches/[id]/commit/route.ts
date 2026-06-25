import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withTransaction } from "@/lib/db";
import { commitUploadBatch, UploadParseError } from "@/lib/commit-upload";
import { logAccess } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// 상태코드를 실어 던지는 내부 에러
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

// POST: waiting 묶음에 발주서+송장이 모두 차면 committed로 승격.
//   - 저장된 두 버퍼로 commitUploadBatch(existingBatchId) 호출 → 파싱·검수·invoices 생성.
//   - ★ 이중 승격 방지: 행 잠금(FOR UPDATE) + status='waiting' 확인.
//   - 검수·매칭·파싱은 commitUploadBatch 안의 기존 로직 그대로(불변).
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
    const batchId = Number(id);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return NextResponse.json({ error: "잘못된 id 입니다." }, { status: 400 });
    }

    let summary: {
      insertedItems: number;
      insertedInvoices: number;
      skippedInvoices: number;
    };
    try {
      const result = await withTransaction(async (client) => {
        // 행 잠금 + 상태/파일 확인 (이중 승격·경합 방지)
        const sel = await client.query(
          `SELECT status,
                  order_file_data, order_filename, order_mime,
                  invoice_file_data, invoice_filename, invoice_mime
             FROM upload_batches
            WHERE id = $1
            FOR UPDATE`,
          [batchId]
        );
        if (sel.rows.length === 0) {
          throw new HttpError(404, "묶음을 찾을 수 없습니다.");
        }
        const b = sel.rows[0];
        if (b.status !== "waiting") {
          throw new HttpError(409, "이미 처리된 묶음입니다.");
        }
        if (!b.order_file_data || !b.invoice_file_data) {
          throw new HttpError(
            400,
            "발주서와 송장이 모두 있어야 승격할 수 있습니다."
          );
        }

        // 저장된 버퍼로 기존 confirm 로직 재사용 (existingBatchId → waiting을 committed로)
        return commitUploadBatch(client, {
          orderBuffer: b.order_file_data,
          invoiceBuffer: b.invoice_file_data,
          orderFilename: b.order_filename,
          invoiceFilename: b.invoice_filename,
          orderMime: b.order_mime,
          invoiceMime: b.invoice_mime,
          userId,
          existingBatchId: batchId,
        });
      });
      summary = {
        insertedItems: result.insertedItems,
        insertedInvoices: result.insertedInvoices,
        skippedInvoices: result.skippedInvoices,
      };
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      // 파싱 실패는 사용자 입력 문제 → 400 (confirm과 동일한 메시지)
      if (e instanceof UploadParseError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      console.error("승격 트랜잭션 실패:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error:
            "데이터 저장 중 오류가 발생해 모든 변경사항을 되돌렸습니다. (" +
            msg +
            ")",
        },
        { status: 500 }
      );
    }

    await logAccess({
      session,
      action: "invoice.bulk_create",
      targetType: "invoice",
      request,
    });

    return NextResponse.json({
      summary,
      message: "송장 등록이 완료되었습니다.",
    });
  } catch (error) {
    console.error("업로드 묶음 승격 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
