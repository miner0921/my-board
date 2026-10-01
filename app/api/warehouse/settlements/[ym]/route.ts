import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { isValidYm } from "@/lib/settlement";

// ─────────────────────────────────────────────────────────────
// PUT    /api/warehouse/settlements/[ym] — 정산내역서 행 일괄 저장 (관리자)
// DELETE /api/warehouse/settlements/[ym] — 정산 월 삭제 (작성중일 때만)
//
// 자동 수량 줄(qty_source 있음)의 qty 는 클라이언트 값을 받지 않는다.
// 그 값은 업로드 원본에서 나오는 것이라 화면에서 덮어쓸 수 있으면 안 된다.
// ─────────────────────────────────────────────────────────────

type Params = { params: Promise<{ ym: string }> };

// 확정 전인 월을 찾아 id 반환. 없거나 확정됐으면 에러 응답.
async function loadDraft(ym: string) {
  if (!isValidYm(ym)) {
    return {
      error: NextResponse.json(
        { error: "정산 월 형식이 올바르지 않습니다." },
        { status: 400 }
      ),
    };
  }
  const res = await query(
    `SELECT id, status FROM settlement_months WHERE ym = $1`,
    [ym]
  );
  const row = res.rows[0];
  if (!row) {
    return {
      error: NextResponse.json(
        { error: "정산 월을 찾을 수 없습니다." },
        { status: 404 }
      ),
    };
  }
  if (row.status === "confirmed") {
    return {
      error: NextResponse.json(
        { error: "확정된 정산은 수정할 수 없습니다. 먼저 확정을 해제하세요." },
        { status: 400 }
      ),
    };
  }
  return { id: row.id as number };
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { ym } = await params;

    const found = await loadDraft(ym);
    if (found.error) return found.error;
    const monthId = found.id!;

    const body = await request.json().catch(() => ({}));
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) {
      return NextResponse.json({ error: "저장할 내용이 없습니다." }, { status: 400 });
    }

    type Patch = {
      id: number;
      name: string;
      note: string;
      unitPrice: number;
      qty: number | null;
    };
    const patches: Patch[] = [];
    for (const r of rawLines) {
      const id = Number(r?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "행 정보가 올바르지 않습니다." }, { status: 400 });
      }
      const unitPrice = Number(r?.unit_price);
      if (!Number.isFinite(unitPrice)) {
        return NextResponse.json({ error: "단가는 숫자여야 합니다." }, { status: 400 });
      }
      const qtyRaw = r?.qty;
      let qty: number | null = null;
      if (qtyRaw !== null && qtyRaw !== undefined && qtyRaw !== "") {
        const n = Number(qtyRaw);
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: "수량은 숫자여야 합니다." }, { status: 400 });
        }
        qty = n;
      }
      patches.push({
        id,
        name: String(r?.name ?? "").slice(0, 100),
        note: String(r?.note ?? "").slice(0, 200),
        unitPrice,
        qty,
      });
    }

    await withTransaction(async (client) => {
      for (const p of patches) {
        // qty_source 가 있는 줄은 수량을 건드리지 않는다 (자동 집계값이 이긴다).
        await client.query(
          `UPDATE settlement_lines
              SET name = $1, note = $2, unit_price = $3,
                  qty = CASE WHEN qty_source IS NULL THEN $4 ELSE qty END
            WHERE id = $5 AND month_id = $6`,
          [p.name, p.note, p.unitPrice, p.qty, p.id, monthId]
        );
      }
    });

    revalidatePath(`/warehouse/settlements/${ym}`);
    return NextResponse.json({ ok: true, saved: patches.length });
  } catch (e) {
    console.error("정산 행 저장 실패:", e);
    return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { ym } = await params;

    const found = await loadDraft(ym);
    if (found.error) return found.error;
    const monthId = found.id!;

    // 자식 테이블은 전부 ON DELETE CASCADE
    await query(`DELETE FROM settlement_months WHERE id = $1`, [monthId]);

    await logAccess({
      session: auth.session,
      action: "settlement_delete",
      targetType: "settlement",
      targetId: monthId,
      request,
    });
    revalidatePath("/warehouse/settlements");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("정산 월 삭제 실패:", e);
    return NextResponse.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
