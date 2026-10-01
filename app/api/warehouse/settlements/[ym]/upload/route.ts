import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { readUploadedXlsx } from "@/lib/upload";
import {
  insertAgreements,
  insertDaily,
  insertShipments,
  isValidYm,
} from "@/lib/settlement";
import { parseSettlementWorkbook } from "@/lib/settlement-parse";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/settlements/[ym]/upload — 정산 엑셀 업로드 (관리자)
// form-data: file
//
// 파일에 들어있는 시트만 갈아끼운다(해당 원본 전체 삭제 후 재삽입).
// 시트가 빠진 파일을 올려도 나머지 원본은 그대로 남는다.
// 행이 수천 개라 UNNEST 로 한 방에 넣는다(lib/settlement.ts 의 insert* 헬퍼).
// ─────────────────────────────────────────────────────────────

type Params = { params: Promise<{ ym: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { ym } = await params;
    if (!isValidYm(ym)) {
      return NextResponse.json({ error: "정산 월 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const monthRes = await query(
      `SELECT id, status FROM settlement_months WHERE ym = $1`,
      [ym]
    );
    const month = monthRes.rows[0];
    if (!month) {
      return NextResponse.json({ error: "정산 월을 찾을 수 없습니다." }, { status: 404 });
    }
    if (month.status === "confirmed") {
      return NextResponse.json(
        { error: "확정된 정산에는 업로드할 수 없습니다. 먼저 확정을 해제하세요." },
        { status: 400 }
      );
    }
    const monthId: number = month.id;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택하세요." }, { status: 400 });
    }
    const checked = await readUploadedXlsx(file);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const parsed = parseSettlementWorkbook(checked.buffer);
    const anySheet =
      parsed.found.processing ||
      parsed.found.inout ||
      parsed.found.shipments ||
      parsed.found.agreements;
    if (!anySheet) {
      return NextResponse.json(
        { error: parsed.warnings[0] ?? "인식할 시트가 없습니다." },
        { status: 400 }
      );
    }

    await withTransaction(async (client) => {
      if (parsed.found.processing) {
        await client.query(
          `DELETE FROM settlement_daily WHERE month_id = $1 AND source = 'processing'`,
          [monthId]
        );
        await insertDaily(
          client,
          monthId,
          parsed.daily.filter((d) => d.source === "processing")
        );
      }
      if (parsed.found.inout) {
        await client.query(
          `DELETE FROM settlement_daily
            WHERE month_id = $1 AND source IN ('inout_in', 'inout_out')`,
          [monthId]
        );
        await insertDaily(
          client,
          monthId,
          parsed.daily.filter((d) => d.source !== "processing")
        );
      }
      if (parsed.found.shipments) {
        await client.query(`DELETE FROM settlement_shipments WHERE month_id = $1`, [monthId]);
        await insertShipments(client, monthId, parsed.shipments);
      }
      if (parsed.found.agreements) {
        await client.query(`DELETE FROM settlement_agreements WHERE month_id = $1`, [monthId]);
        await insertAgreements(client, monthId, parsed.agreements);
      }
    });

    await logAccess({
      session: auth.session,
      action: "settlement_upload",
      targetType: "settlement",
      targetId: monthId,
      request,
    });
    revalidatePath(`/warehouse/settlements/${ym}`);

    return NextResponse.json({
      ok: true,
      found: parsed.found,
      counts: {
        processing: parsed.daily.filter((d) => d.source === "processing").length,
        inout: parsed.daily.filter((d) => d.source !== "processing").length,
        shipments: parsed.shipments.length,
        agreements: parsed.agreements.length,
      },
      warnings: parsed.warnings,
    });
  } catch (e) {
    console.error("정산 엑셀 업로드 실패:", e);
    return NextResponse.json(
      { error: "엑셀을 읽지 못했습니다. 양식을 확인해주세요." },
      { status: 500 }
    );
  }
}
