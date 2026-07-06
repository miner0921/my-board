import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { readUploadedImage } from "@/lib/upload";
import { logAccess } from "@/lib/audit";
import { requireUser } from "@/lib/auth-helper";
import { buildItemFields, MAX_BARCODE_LEN } from "@/lib/product-name";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 단일 품목 조회 (로그인 필수)
// 수정 페이지 초기값 로딩용. image_data는 SELECT 하지 않음.
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;

    const result = await query(
      `SELECT
         i.id, i.product_code, i.category, i.kind, i.barcode, i.name,
         i.created_by, i.created_at, i.updated_at,
         i.is_auto_created, i.scan_exempt, i.inspection_exempt,
         (i.image_data IS NOT NULL) AS has_image,
         u.nickname AS author_nickname
       FROM items i
       LEFT JOIN users u ON i.created_by = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 별칭(같은 취급 품명) 목록 — 수정 모달 표시용
    const aliasRes = await query(
      `SELECT id, alias_name, normalized_alias
         FROM item_aliases
        WHERE item_id = $1
        ORDER BY id`,
      [id]
    );

    // 추가 바코드 목록 — 수정 모달 "추가 바코드" 섹션 표시용
    const barcodeRes = await query(
      `SELECT id, barcode
         FROM item_barcodes
        WHERE item_id = $1
        ORDER BY id`,
      [id]
    );

    await logAccess({
      session,
      action: "item.read",
      targetType: "item",
      targetId: id,
      request,
    });

    return NextResponse.json({
      item: result.rows[0],
      aliases: aliasRes.rows,
      barcodes: barcodeRes.rows,
    });
  } catch (error) {
    console.error("품목 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PUT: 품목 수정 (본인만)
// product_code/category/kind/barcode 수정. name(품명)은 buildItemName(구분, 종류) = 정규화 품명.
// 구분/종류는 입력 원본 보존, name 은 정규화형으로만 기록 — name 만 따로 바꾸는 경로 없음.
// barcode 빈 문자열은 NULL 로 저장.
// image 새 파일이면 교체, removeImage="1"이면 NULL, 둘 다 아니면 기존 유지.
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    // 권한: 로그인 필수. 역할 기준 분기(관리자=전체 / 작업자=바코드·이미지만).
    const authz = await requireUser();
    if (!authz.ok) return authz.response;
    const { session, role } = authz;
    const isAdmin = role === "admin";

    const { id } = await params;
    const formData = await request.formData();
    const image = formData.get("image");
    const removeImage = formData.get("removeImage") === "1";

    // 기존행 로드 — 404 체크 + 작업자 경로에서 그대로 유지할 값(name 불변 = 매칭키 보존)
    const check = await query(
      "SELECT product_code, category, kind, name, scan_exempt, inspection_exempt FROM items WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return NextResponse.json(
        { error: "품목을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    const cur = check.rows[0];

    // 역할별 반영 필드 결정
    let name: string;
    let category: string | null;
    let kind: string | null;
    let productCode: string | null;
    let barcode: string | null;
    let scanExempt: boolean;
    let inspectionExempt: boolean;

    if (isAdmin) {
      // 관리자: 전체 필드 수정 + name 재조합 (정규화형) — 현행 그대로
      const fields = buildItemFields({
        productCodeRaw: String(formData.get("product_code") ?? ""),
        category: String(formData.get("category") ?? ""),
        kind: String(formData.get("kind") ?? ""),
        barcodeRaw: String(formData.get("barcode") ?? ""),
      });
      if (!fields.ok) {
        return NextResponse.json({ error: fields.error }, { status: 400 });
      }
      ({ name, category, kind, productCode, barcode } = fields);
      scanExempt = formData.get("scan_exempt") === "1";
      inspectionExempt = formData.get("inspection_exempt") === "1";

      // 품명 중복 방지(관리자가 품명을 바꿀 수 있는 경로만) — 자기 자신 제외하고
      //   활성 품목 중 같은 정규화 품명(name)이 있으면 거부. name 은 정규화형이라 컬럼 직접 비교.
      //   (작업자 경로는 name 이 기존값 그대로라 검사 불필요 → else 분기엔 없음.)
      const dup = await query(
        "SELECT id FROM items WHERE name = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1",
        [name, id]
      );
      if (dup.rows.length > 0) {
        return NextResponse.json(
          {
            error: `이미 같은 품명의 품목이 있습니다: ${name}. 기존 품목을 수정하거나 다른 품명을 사용하세요.`,
          },
          { status: 409 }
        );
      }
    } else {
      // 작업자: 바코드만 폼에서 수용(+이미지). 나머지는 기존값 그대로 유지.
      //   ★ name(구분+종류)을 기존값으로 보존 → 검수 매칭 키 불변. 폼이 보낸
      //     품목코드/구분/종류/동봉 값은 무시(프론트 우회해도 서버가 차단).
      const barcodeRaw = String(formData.get("barcode") ?? "").trim();
      if (barcodeRaw.length > MAX_BARCODE_LEN) {
        return NextResponse.json(
          { error: "바코드는 100자 이하여야 합니다." },
          { status: 400 }
        );
      }
      barcode = barcodeRaw === "" ? null : barcodeRaw;
      productCode = cur.product_code;
      category = cur.category;
      kind = cur.kind;
      name = cur.name;
      scanExempt = cur.scan_exempt === true;
      // 스캔불필요도 관리자 전용(동봉과 동일 정책) — 작업자 경로는 기존값 보존.
      inspectionExempt = cur.inspection_exempt === true;
    }

    let imageSql: string;
    let imageParams: unknown[];

    if (image instanceof File && image.size > 0) {
      const parsed = await readUploadedImage(image);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      imageSql = ", image_data = $9, image_mime = $10";
      imageParams = [parsed.buffer, parsed.mime];
    } else if (removeImage) {
      imageSql = ", image_data = NULL, image_mime = NULL";
      imageParams = [];
    } else {
      imageSql = "";
      imageParams = [];
    }

    // 바코드는 중복 허용 (016에서 UNIQUE 제약 해제).
    const result = await query(
      `UPDATE items
       SET product_code = $1, category = $2, kind = $3, barcode = $4, name = $5,
           scan_exempt = $6, inspection_exempt = $7, updated_at = CURRENT_TIMESTAMP
           ${imageSql}
       WHERE id = $8
       RETURNING id, product_code, category, kind, barcode, name, updated_at, scan_exempt, inspection_exempt,
                 (image_data IS NOT NULL) AS has_image`,
      [productCode, category, kind, barcode, name, scanExempt, inspectionExempt, id, ...imageParams]
    );

    await logAccess({
      session,
      action: "item.update",
      targetType: "item",
      targetId: id,
      request,
    });

    // 품목 목록 화면 캐시 무효화 (다음 조회 시 새로 렌더)
    revalidatePath("/warehouse/items");

    return NextResponse.json({ item: result.rows[0], message: "수정 완료!" });
  } catch (error) {
    console.error("품목 수정 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// 품목 "삭제"는 숨김(soft delete)으로 전환됨 → POST /api/warehouse/items/hide
// (완전삭제 라우트 제거: 검수기록·송장 참조 보존)
