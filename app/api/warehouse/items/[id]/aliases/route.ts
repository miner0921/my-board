import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helper";
import { logAccess } from "@/lib/audit";
import { itemMatchKey, loadItemIndex } from "@/lib/resolve-item";
import { MAX_NAME_LEN } from "@/lib/product-name";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST: 품목 별칭(같은 취급 품명) 추가 (관리자만).
// 별칭 = 또 다른 정규화 품명 → 같은 품목. 송장 매칭(confirm/preview)에서만 인식.
// 충돌은 모두 하드 블록(경고 후 강행 없음) — 매칭은 한 글자 오차도 위험하므로.
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authz = await requireAdmin();
    if (!authz.ok) return authz.response;

    const { id } = await params;
    const itemId = Number(id);

    const body = await request.json().catch(() => ({}));
    const aliasName = String(body?.alias ?? "").trim();
    const key = itemMatchKey(aliasName);

    // 1) 빈 별칭
    if (key === "") {
      return NextResponse.json(
        { error: "별칭이 비어있습니다." },
        { status: 400 }
      );
    }
    // 길이 제한
    if (aliasName.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: "별칭은 200자 이하여야 합니다." },
        { status: 400 }
      );
    }

    // 대상 품목 확인 (활성)
    const itemRes = await query(
      "SELECT id, name FROM items WHERE id = $1 AND deleted_at IS NULL",
      [itemId]
    );
    if (itemRes.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 2) 정규화하면 이 품목 품명과 동일 → 별칭 불필요
    if (key === itemMatchKey(itemRes.rows[0].name)) {
      return NextResponse.json(
        { error: "정규화하면 이 품목 품명과 같아 별칭이 필요 없습니다." },
        { status: 400 }
      );
    }

    // 3·4) 이미 다른 품목 품명/별칭, 또는 이 품목의 기존 별칭과 충돌
    const index = await loadItemIndex(query);
    const existing = index.get(key);
    if (existing !== undefined) {
      if (existing === itemId) {
        return NextResponse.json(
          { error: "이미 등록된 별칭입니다." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error:
            "이 품명은 이미 다른 품목이 사용 중입니다 — 별칭으로 등록할 수 없습니다.",
        },
        { status: 409 }
      );
    }

    let inserted;
    try {
      const res = await query(
        `INSERT INTO item_aliases (item_id, alias_name, normalized_alias, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, alias_name, normalized_alias`,
        [itemId, aliasName, key, authz.userId]
      );
      inserted = res.rows[0];
    } catch (e) {
      // UNIQUE(normalized_alias) 경쟁 상황 방어
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("item_aliases_normalized_alias_key") || msg.includes("unique")) {
        return NextResponse.json(
          {
            error:
              "이 품명은 이미 다른 품목이 사용 중입니다 — 별칭으로 등록할 수 없습니다.",
          },
          { status: 409 }
        );
      }
      throw e;
    }

    await logAccess({
      session: authz.session,
      action: "item.alias_create",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({ alias: inserted, message: "별칭이 추가되었습니다." }, { status: 201 });
  } catch (error) {
    console.error("별칭 추가 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
