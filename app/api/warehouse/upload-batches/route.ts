import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { readUploadedXlsx } from "@/lib/upload";

// GET: 업로드 내역(등록 단위) 목록 (로그인 필수)
// ★ BYTEA(file_data)는 절대 SELECT 안 함 — 존재 여부/파일명/목록만.
//   파일은 한 batch에 N개일 수 있음. 현 UI 호환을 위해 각 kind의 "첫 파일"도 같이 제공.
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
         EXISTS (SELECT 1 FROM upload_files f
                  WHERE f.batch_id = b.id AND f.kind = 'order')   AS has_order_file,
         EXISTS (SELECT 1 FROM upload_files f
                  WHERE f.batch_id = b.id AND f.kind = 'invoice') AS has_invoice_file,
         (SELECT f.filename FROM upload_files f
           WHERE f.batch_id = b.id AND f.kind = 'order'
           ORDER BY f.id LIMIT 1)   AS order_filename,
         (SELECT f.filename FROM upload_files f
           WHERE f.batch_id = b.id AND f.kind = 'invoice'
           ORDER BY f.id LIMIT 1)   AS invoice_filename,
         (SELECT f.uploaded_at FROM upload_files f
           WHERE f.batch_id = b.id AND f.kind = 'order'
           ORDER BY f.id LIMIT 1)   AS order_uploaded_at,
         (SELECT f.uploaded_at FROM upload_files f
           WHERE f.batch_id = b.id AND f.kind = 'invoice'
           ORDER BY f.id LIMIT 1)   AS invoice_uploaded_at,
         (SELECT uo.nickname FROM upload_files f
            LEFT JOIN users uo ON f.uploaded_by = uo.id
           WHERE f.batch_id = b.id AND f.kind = 'order'
           ORDER BY f.id LIMIT 1)   AS order_uploaded_by_name,
         (SELECT ui.nickname FROM upload_files f
            LEFT JOIN users ui ON f.uploaded_by = ui.id
           WHERE f.batch_id = b.id AND f.kind = 'invoice'
           ORDER BY f.id LIMIT 1)   AS invoice_uploaded_by_name,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', f.id, 'kind', f.kind, 'filename', f.filename
                  ) ORDER BY f.id)
             FROM upload_files f WHERE f.batch_id = b.id
         ), '[]'::json) AS files,
         b.inserted_items,
         b.inserted_invoices,
         b.skipped_invoices,
         b.created_at
       FROM upload_batches b
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 100`
    );

    return NextResponse.json({ batches: result.rows });
  } catch (error) {
    console.error("업로드 내역 목록 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 파일 한쪽만 올려 waiting 내역에 보관(stash). 파싱/송장생성 없음 — 순수 보관.
//   - batchId 없음 → 새 waiting batch 생성 + upload_files에 파일 1행.
//   - batchId 있음 → 그 waiting batch에 파일 append (한 kind에 여러 개 허용).
//   양쪽(order/invoice)이 모두 있으면 readyToCommit=true. 승격은 /commit 라우트.
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
    const mime = file.type || null;
    const label = kind === "order" ? "발주서" : "송장";

    // ── 새 waiting batch 생성 ──
    if (batchIdRaw == null || batchIdRaw === "") {
      const result = await withTransaction(async (client) => {
        const ins = await client.query(
          `INSERT INTO upload_batches (status, created_by)
           VALUES ('waiting', $1) RETURNING id`,
          [userId]
        );
        const batchId = ins.rows[0].id;
        await client.query(
          `INSERT INTO upload_files (batch_id, kind, file_data, filename, mime, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [batchId, kind, read.buffer, file.name, mime, userId]
        );
        return batchId;
      });
      return NextResponse.json({
        id: result,
        status: "waiting",
        message: `${label} 파일을 저장했습니다.`,
      });
    }

    // ── 기존 waiting batch에 파일 추가 ──
    const batchId = Number(batchIdRaw);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return NextResponse.json(
        { error: "잘못된 batchId 입니다." },
        { status: 400 }
      );
    }

    try {
      const readyToCommit = await withTransaction(async (client) => {
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

        await client.query(
          `INSERT INTO upload_files (batch_id, kind, file_data, filename, mime, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [batchId, kind, read.buffer, file.name, mime, userId]
        );

        // 발주서·송장 둘 다 생겼나
        const ex = await client.query(
          `SELECT
             bool_or(kind = 'order')   AS has_order,
             bool_or(kind = 'invoice') AS has_invoice
           FROM upload_files WHERE batch_id = $1`,
          [batchId]
        );
        return Boolean(ex.rows[0].has_order && ex.rows[0].has_invoice);
      });

      return NextResponse.json({
        id: batchId,
        status: "waiting",
        readyToCommit,
        message: `${label} 파일을 추가했습니다.`,
      });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  } catch (error) {
    console.error("업로드 내역 저장 에러:", error);
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
