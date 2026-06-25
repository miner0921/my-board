import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { readUploadedXlsx } from "@/lib/upload";

// GET: 업로드 묶음(발주서+송장) 목록 (로그인 필수)
// ★ BYTEA(order_file_data/invoice_file_data)는 절대 SELECT 안 함 — 존재 여부 플래그만.
//   파일 다운로드는 /upload-batches/[id]/file 라우트에서 별도로.
// 최근 100개까지(데이터 적어 충분, 많아지면 페이지네이션 도입).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const result = await query(
      `SELECT
         b.id,
         b.status,
         b.order_filename,
         (b.order_file_data IS NOT NULL)   AS has_order_file,
         b.order_uploaded_at,
         uo.nickname AS order_uploaded_by_name,
         b.invoice_filename,
         (b.invoice_file_data IS NOT NULL) AS has_invoice_file,
         b.invoice_uploaded_at,
         ui.nickname AS invoice_uploaded_by_name,
         b.inserted_items,
         b.inserted_invoices,
         b.skipped_invoices,
         b.created_at
       FROM upload_batches b
       LEFT JOIN users uo ON b.order_uploaded_by   = uo.id
       LEFT JOIN users ui ON b.invoice_uploaded_by = ui.id
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 100`
    );

    return NextResponse.json({ batches: result.rows });
  } catch (error) {
    console.error("업로드 묶음 목록 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 파일 한쪽만 올려 waiting 묶음에 보관(stash). 파싱/송장생성 없음 — 순수 보관.
//   - batchId 없음 → 새 waiting batch 생성(해당 kind 측만 채움, 반대쪽 NULL).
//   - batchId 있음 → 그 waiting batch의 "빈" kind 측을 채움(이미 차 있으면 409).
//   양쪽이 다 차도 여기선 status를 그대로 waiting으로 둔다. 승격은 /commit 라우트.
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
    const file = formData.get("file");
    const kind = formData.get("kind");
    const batchIdRaw = formData.get("batchId");

    if (kind !== "order" && kind !== "invoice") {
      return NextResponse.json(
        { error: "kind는 order 또는 invoice 여야 합니다." },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "파일을 업로드해주세요." },
        { status: 400 }
      );
    }

    const read = await readUploadedXlsx(file);
    if (!read.ok) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }

    // kind는 화이트리스트 검증 완료 → 컬럼명 안전하게 구성
    const dataCol = kind === "order" ? "order_file_data" : "invoice_file_data";
    const fnCol = kind === "order" ? "order_filename" : "invoice_filename";
    const mimeCol = kind === "order" ? "order_mime" : "invoice_mime";
    const byCol =
      kind === "order" ? "order_uploaded_by" : "invoice_uploaded_by";
    const atCol =
      kind === "order" ? "order_uploaded_at" : "invoice_uploaded_at";
    const mime = file.type || null;
    const label = kind === "order" ? "발주서" : "송장";

    // ── 새 waiting batch 생성 ──
    if (batchIdRaw == null || batchIdRaw === "") {
      const ins = await query(
        `INSERT INTO upload_batches
           (${dataCol}, ${fnCol}, ${mimeCol}, ${byCol}, ${atCol}, status, created_by)
         VALUES ($1, $2, $3, $4, NOW(), 'waiting', $5)
         RETURNING id`,
        [read.buffer, file.name, mime, userId, userId]
      );
      return NextResponse.json({
        id: ins.rows[0].id,
        status: "waiting",
        message: `${label} 파일을 대기 묶음으로 저장했습니다.`,
      });
    }

    // ── 기존 waiting batch의 빈 측 채우기 ──
    const batchId = Number(batchIdRaw);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return NextResponse.json(
        { error: "잘못된 batchId 입니다." },
        { status: 400 }
      );
    }

    try {
      const result = await withTransaction(async (client) => {
        // 동시성: 행 잠금 후 상태/빈측 확인
        const sel = await client.query(
          `SELECT status,
                  (order_file_data   IS NOT NULL) AS has_order_file,
                  (invoice_file_data IS NOT NULL) AS has_invoice_file
             FROM upload_batches
            WHERE id = $1
            FOR UPDATE`,
          [batchId]
        );
        if (sel.rows.length === 0) {
          throw new HttpError(404, "묶음을 찾을 수 없습니다.");
        }
        const row = sel.rows[0];
        if (row.status !== "waiting") {
          throw new HttpError(409, "이미 처리된 묶음입니다.");
        }
        const sideFilled =
          kind === "order" ? row.has_order_file : row.has_invoice_file;
        if (sideFilled) {
          throw new HttpError(409, `이미 ${label} 파일이 있습니다.`);
        }

        await client.query(
          `UPDATE upload_batches
              SET ${dataCol} = $2, ${fnCol} = $3, ${mimeCol} = $4,
                  ${byCol} = $5, ${atCol} = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [batchId, read.buffer, file.name, mime, userId]
        );

        const readyToCommit =
          kind === "order" ? row.has_invoice_file : row.has_order_file;
        return { readyToCommit };
      });

      return NextResponse.json({
        id: batchId,
        status: "waiting",
        readyToCommit: result.readyToCommit, // 양쪽 다 찼으니 이제 승격 가능
        message: `${label} 파일을 묶음에 추가했습니다.`,
      });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  } catch (error) {
    console.error("업로드 묶음 stash 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// 상태코드를 실어 던지는 내부 에러
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}
