import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { deductStock } from "@/lib/stock";

// ─────────────────────────────────────────────────────────────
// POST /api/warehouse/stock/out — 수동 출고 (관리자)
// body: { items: [{ item_id, quantity }], memo? }
//
// 여러 품목을 한 번에 뺀다. 전부 한 트랜잭션 — 한 줄이라도 실패하면 전체 롤백.
// 차감 순서는 lib/stock.ts 가 정한다: 소비기한 빠른 순 → (없으면) 입고일 순.
// 재고가 모자라면 있는 만큼 빼고 부족분을 이력에 남긴다(막지 않음).
// ─────────────────────────────────────────────────────────────

const MAX_LINES = 200;

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { session, userId } = auth;

    const body = await request.json().catch(() => ({}));
    const memoRaw = typeof body.memo === "string" ? body.memo.trim() : "";
    const memo = memoRaw === "" ? null : memoRaw.slice(0, 200);

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const lines: { itemId: number; quantity: number }[] = [];
    for (const r of rawItems) {
      const itemId = Number(r?.item_id);
      const quantity = Number(r?.quantity);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return NextResponse.json({ error: "품목을 선택하세요." }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "수량은 1 이상의 정수여야 합니다." },
          { status: 400 }
        );
      }
      lines.push({ itemId, quantity });
    }
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "출고할 품목을 1개 이상 추가하세요." },
        { status: 400 }
      );
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_LINES}줄까지 처리할 수 있습니다.` },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT id, name FROM items
          WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
        [[...new Set(lines.map((l) => l.itemId))]]
      );
      const names = new Map<number, string>(
        found.rows.map((r) => [Number(r.id), r.name as string])
      );
      if (lines.some((l) => !names.has(l.itemId))) {
        return { kind: "not_found" as const };
      }

      let deducted = 0;
      let negative = 0;
      for (const l of lines) {
        const r = await deductStock(client, {
          itemId: l.itemId,
          quantity: l.quantity,
          reason: "manual_out",
          memo,
          userId,
        });
        deducted += r.deducted;
        negative += r.negative;
      }

      return {
        kind: "ok" as const,
        deducted,
        negative,
        name: names.get(lines[0].itemId)!,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    for (const l of lines) {
      await logAccess({
        session,
        action: "stock.out",
        targetType: "item",
        targetId: l.itemId,
        request,
      });
    }
    revalidatePath("/warehouse/stock");

    const head =
      lines.length === 1
        ? `${result.name} ${result.deducted}개 출고`
        : `${lines.length}줄 ${result.deducted}개 출고`;
    return NextResponse.json({
      message:
        result.negative > 0
          ? `${head} (재고보다 ${result.negative}개 많아 마이너스로 기록)`
          : `${head} 완료`,
      deducted: result.deducted,
      negative: result.negative,
    });
  } catch (e) {
    console.error("재고 출고 실패:", e);
    return NextResponse.json(
      { error: "출고 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
