import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withTransaction } from "@/lib/db";
import { readUploadedXlsx } from "@/lib/upload";
import { commitUploadBatch, UploadParseError } from "@/lib/commit-upload";
import { logAccess } from "@/lib/audit";

// POST: 같은 발주서/송장 파일 두 개를 다시 받아 트랜잭션으로 실제 저장.
// preview의 출력을 신뢰하지 않고 서버에서 재분석한다(클라이언트 위·변조 방지).
// 실제 저장 로직은 lib/commit-upload.ts의 commitUploadBatch로 일원화(승격과 공유).
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const orderFile = formData.get("order");
    const invoiceFile = formData.get("invoice");
    if (!(orderFile instanceof File) || !(invoiceFile instanceof File)) {
      return NextResponse.json(
        { error: "발주서와 송장 파일을 모두 업로드해주세요." },
        { status: 400 }
      );
    }

    const orderRead = await readUploadedXlsx(orderFile);
    if (!orderRead.ok) {
      return NextResponse.json(
        { error: `발주서: ${orderRead.error}` },
        { status: 400 }
      );
    }
    const invoiceRead = await readUploadedXlsx(invoiceFile);
    if (!invoiceRead.ok) {
      return NextResponse.json(
        { error: `송장: ${invoiceRead.error}` },
        { status: 400 }
      );
    }

    const userId = Number(session.user.id);

    let summary: {
      insertedItems: number;
      insertedInvoices: number;
      skippedInvoices: number;
    };
    try {
      const result = await withTransaction((client) =>
        commitUploadBatch(client, {
          orderBuffer: orderRead.buffer,
          invoiceBuffer: invoiceRead.buffer,
          orderFilename: orderFile.name,
          invoiceFilename: invoiceFile.name,
          orderMime: orderFile.type || null,
          invoiceMime: invoiceFile.type || null,
          userId,
          existingBatchId: null, // 동시 업로드 → 새 committed batch
        })
      );
      summary = {
        insertedItems: result.insertedItems,
        insertedInvoices: result.insertedInvoices,
        skippedInvoices: result.skippedInvoices,
      };
    } catch (e) {
      // 파싱 실패는 사용자 입력 문제 → 400 (기존 동작과 동일한 메시지)
      if (e instanceof UploadParseError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      console.error("트랜잭션 실패:", e);
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
    console.error("송장 확정 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
