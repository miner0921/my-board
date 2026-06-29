import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

// POST: waiting 내역에 발주서+송장이 모두 있으면 committed로 등록(승격).
//   - upload_files에 저장된 버퍼들(발주서 N · 송장 M)을 로드 → commitUploadBatch.
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
        // 행 잠금 + 상태 확인 (이중 승격·경합 방지)
        const sel = await client.query(
          `SELECT status FROM upload_batches WHERE id = $1 FOR UPDATE`,
          [batchId]
        );
        if (sel.rows.length === 0) {
          throw new HttpError(404, "내역을 찾을 수 없습니다.");
        }
        if (sel.rows[0].status !== "waiting") {
          throw new HttpError(409, "이미 처리된 내역입니다.");
        }

        // 저장된 파일들 로드 (kind별 버퍼 배열)
        const files = await client.query(
          `SELECT kind, file_data
             FROM upload_files
            WHERE batch_id = $1
            ORDER BY id`,
          [batchId]
        );
        const orderBuffers: Buffer[] = [];
        const invoiceBuffers: Buffer[] = [];
        for (const row of files.rows) {
          if (row.kind === "order") orderBuffers.push(row.file_data);
          else if (row.kind === "invoice") invoiceBuffers.push(row.file_data);
        }
        if (orderBuffers.length === 0 || invoiceBuffers.length === 0) {
          throw new HttpError(
            400,
            "발주서와 송장이 모두 있어야 등록할 수 있습니다."
          );
        }

        return commitUploadBatch(client, {
          orderBuffers,
          invoiceBuffers,
          userId,
          batchId,
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

    // 송장 목록 화면 캐시 무효화 (다음 조회 시 새로 렌더)
    revalidatePath("/warehouse/invoices");

    return NextResponse.json({
      summary,
      message: "송장 등록이 완료되었습니다.",
    });
  } catch (error) {
    console.error("업로드 내역 승격 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
