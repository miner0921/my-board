import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// PUT /api/warehouse/invoices/[id]/invoice-no
// 송장번호(invoice_no) 변경 + 변경 이력(invoice_no_changes) 기록.
//   - 로그인한 작업자 전원 가능(requireUser). status 제한 없음(완료 송장도 가능).
//   - 이미 다른 송장이 쓰는 번호로는 못 바꿈(UNIQUE 충돌 방지).
//     UNIQUE는 soft delete된 번호도 포함하므로 중복 검사는 deleted_at 필터 없이.
// ─────────────────────────────────────────────────────────────

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_NO_LEN = 100; // invoices.invoice_no VARCHAR(100)

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const authz = await requireUser();
    if (!authz.ok) return authz.response;
    const userId = authz.userId;

    const { id } = await params;
    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId)) {
      return NextResponse.json(
        { error: "잘못된 송장 ID입니다." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const newNo = typeof body?.new_no === "string" ? body.new_no.trim() : "";
    if (newNo.length === 0) {
      return NextResponse.json(
        { error: "송장번호를 입력하세요." },
        { status: 400 }
      );
    }
    if (newNo.length > MAX_NO_LEN) {
      return NextResponse.json(
        { error: `송장번호는 ${MAX_NO_LEN}자 이하여야 합니다.` },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      // 대상 송장 락 + 현재 번호 확보
      const invRes = await client.query(
        `SELECT id, invoice_no FROM invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId]
      );
      if (invRes.rows.length === 0) {
        return { kind: "not_found" as const };
      }
      const oldNo = invRes.rows[0].invoice_no as string;

      // 변경 없음(같은 값) → 이력 남기지 않고 성공 처리
      if (oldNo === newNo) {
        return { kind: "unchanged" as const, oldNo };
      }

      // 중복 검사 — deleted_at 필터 없이 전체(자기 자신 제외).
      const dupRes = await client.query(
        `SELECT 1 FROM invoices WHERE invoice_no = $1 AND id <> $2 LIMIT 1`,
        [newNo, invoiceId]
      );
      if (dupRes.rows.length > 0) {
        return { kind: "duplicate" as const };
      }

      // 번호 변경 + 이력 기록
      await client.query(
        `UPDATE invoices SET invoice_no = $1 WHERE id = $2`,
        [newNo, invoiceId]
      );
      await client.query(
        `INSERT INTO invoice_no_changes (invoice_id, old_no, new_no, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [invoiceId, oldNo, newNo, userId]
      );

      return { kind: "ok" as const, oldNo };
    }).catch((e: unknown) => {
      // DB UNIQUE 제약(23505) 위반 — 사전 검사와 실제 제약 이중 방어.
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: string }).code === "23505"
      ) {
        return { kind: "duplicate" as const };
      }
      throw e;
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "송장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json(
        { error: "이미 사용 중인 송장번호입니다." },
        { status: 409 }
      );
    }
    if (result.kind === "unchanged") {
      return NextResponse.json({
        invoice_no: result.oldNo,
        changed: false,
        message: "변경 사항이 없습니다.",
      });
    }

    // 성공 — 감사 로그 + 캐시 무효화
    await logAccess({
      session: authz.session,
      action: "invoice.change_no",
      targetType: "invoice",
      targetId: invoiceId,
      request,
    });
    revalidatePath(`/warehouse/invoices/${invoiceId}`);
    revalidatePath("/warehouse/invoices");

    return NextResponse.json({
      invoice_no: newNo,
      changed: true,
      message: "송장번호가 변경되었습니다.",
    });
  } catch (error) {
    console.error("송장번호 변경 API 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
