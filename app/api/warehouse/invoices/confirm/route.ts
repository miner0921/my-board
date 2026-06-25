import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withTransaction } from "@/lib/db";
import { readUploadedXlsx } from "@/lib/upload";
import { commitUploadBatch, UploadParseError } from "@/lib/commit-upload";
import { logAccess } from "@/lib/audit";

// POST: 발주서/송장 파일(각 1개 이상)을 받아 트랜잭션으로 등록.
//   - 파일은 upload_files에 저장하고 batch 헤더 생성 → commitUploadBatch로 등록.
//   - preview 출력을 신뢰하지 않고 서버에서 재분석(매칭은 commitUploadBatch 안의 기존 로직).
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

    const formData = await request.formData();
    // 여러 파일 허용(getAll). 현재 UI는 각 1개 → 길이 1 배열로 호환.
    const orderFiles = formData.getAll("order").filter((f) => f instanceof File) as File[];
    const invoiceFiles = formData
      .getAll("invoice")
      .filter((f) => f instanceof File) as File[];

    if (orderFiles.length === 0 || invoiceFiles.length === 0) {
      return NextResponse.json(
        { error: "발주서와 송장 파일을 모두 업로드해주세요." },
        { status: 400 }
      );
    }

    // 각 파일 검증 + 버퍼 확보
    const orders: { buffer: Buffer; name: string; mime: string | null }[] = [];
    for (const f of orderFiles) {
      const read = await readUploadedXlsx(f);
      if (!read.ok) {
        return NextResponse.json(
          { error: `발주서: ${read.error}` },
          { status: 400 }
        );
      }
      orders.push({ buffer: read.buffer, name: f.name, mime: f.type || null });
    }
    const invoices: { buffer: Buffer; name: string; mime: string | null }[] = [];
    for (const f of invoiceFiles) {
      const read = await readUploadedXlsx(f);
      if (!read.ok) {
        return NextResponse.json(
          { error: `송장: ${read.error}` },
          { status: 400 }
        );
      }
      invoices.push({ buffer: read.buffer, name: f.name, mime: f.type || null });
    }

    let summary: {
      insertedItems: number;
      insertedInvoices: number;
      skippedInvoices: number;
    };
    try {
      const result = await withTransaction(async (client) => {
        // batch 헤더 생성 (임베드 파일 컬럼은 쓰지 않음 — 파일은 upload_files로)
        const batchRes = await client.query(
          `INSERT INTO upload_batches (status, created_by)
           VALUES ('committed', $1)
           RETURNING id`,
          [userId]
        );
        const batchId = batchRes.rows[0].id;

        // 파일들을 upload_files에 저장
        for (const o of orders) {
          await client.query(
            `INSERT INTO upload_files (batch_id, kind, file_data, filename, mime, uploaded_by)
             VALUES ($1, 'order', $2, $3, $4, $5)`,
            [batchId, o.buffer, o.name, o.mime, userId]
          );
        }
        for (const v of invoices) {
          await client.query(
            `INSERT INTO upload_files (batch_id, kind, file_data, filename, mime, uploaded_by)
             VALUES ($1, 'invoice', $2, $3, $4, $5)`,
            [batchId, v.buffer, v.name, v.mime, userId]
          );
        }

        return commitUploadBatch(client, {
          orderBuffers: orders.map((o) => o.buffer),
          invoiceBuffers: invoices.map((v) => v.buffer),
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
