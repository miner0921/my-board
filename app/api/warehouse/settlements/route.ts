import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { DEFAULT_LINES, isValidYm } from "@/lib/settlement";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/settlements — 월 정산 만들기 (관리자)
// body: { ym: '2026-08' }
//
// 항목 구성과 단가는 직전 월에서 복사한다(매달 거의 같다). 직전 월이 없으면 기본 템플릿.
// 수량은 복사하지 않는다 — 자동분은 업로드에서, 수동분은 사람이 매달 새로 넣는다.
// '기타' 섹션은 그 달에만 있는 보상·차감이라 복사할 때 내용을 비운다
// (안 그러면 지난달 차감액이 단가 그대로 딸려와 조용히 금액에 반영된다).
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const ym = typeof body.ym === "string" ? body.ym.trim() : "";
    if (!isValidYm(ym)) {
      return NextResponse.json(
        { error: "정산 월 형식이 올바르지 않습니다 (YYYY-MM)." },
        { status: 400 }
      );
    }

    const monthId = await withTransaction(async (client) => {
      const dup = await client.query(
        `SELECT id FROM settlement_months WHERE ym = $1`,
        [ym]
      );
      if (dup.rowCount && dup.rowCount > 0) {
        throw new Error("DUPLICATE");
      }

      const ins = await client.query(
        `INSERT INTO settlement_months (ym, created_by) VALUES ($1, $2) RETURNING id`,
        [ym, auth.userId]
      );
      const id: number = ins.rows[0].id;

      // 직전 월 구성 복사 (기타 섹션은 내용 비움)
      const prev = await client.query(
        `SELECT id FROM settlement_months WHERE ym < $1 ORDER BY ym DESC LIMIT 1`,
        [ym]
      );
      if (prev.rowCount && prev.rowCount > 0) {
        await client.query(
          `INSERT INTO settlement_lines
             (month_id, section, sort_no, name, note, unit_price, qty, qty_source)
           SELECT $1, section, sort_no,
                  CASE WHEN section = 'etc' THEN '' ELSE name END,
                  CASE WHEN section = 'etc' THEN '' ELSE note END,
                  CASE WHEN section = 'etc' THEN 0 ELSE unit_price END,
                  CASE WHEN qty IS NULL THEN NULL ELSE 0 END,
                  qty_source
             FROM settlement_lines WHERE month_id = $2`,
          [id, prev.rows[0].id]
        );
      } else {
        for (let i = 0; i < DEFAULT_LINES.length; i++) {
          const t = DEFAULT_LINES[i];
          await client.query(
            `INSERT INTO settlement_lines
               (month_id, section, sort_no, name, note, unit_price, qty, qty_source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, t.section, i, t.name, t.note, t.unitPrice, t.noQty ? null : 0, t.qtySource]
          );
        }
      }
      return id;
    });

    await logAccess({
      session: auth.session,
      action: "settlement_create",
      targetType: "settlement",
      targetId: monthId,
      request,
    });
    revalidatePath("/warehouse/settlements");

    return NextResponse.json({ ok: true, ym });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE") {
      return NextResponse.json(
        { error: "이미 만들어진 정산 월입니다." },
        { status: 409 }
      );
    }
    console.error("정산 월 생성 실패:", e);
    return NextResponse.json(
      { error: "정산 월을 만들지 못했습니다." },
      { status: 500 }
    );
  }
}
