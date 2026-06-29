import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { readUploadedImage } from "@/lib/upload";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helper";
import { buildItemFields } from "@/lib/product-name";

// GET: 품목 목록 (로그인 필수)
// ?q= 가 있으면 품목코드/품명/바코드 부분일치 검색
// image_data(BYTEA)는 절대 SELECT 하지 않음. has_image 로 존재 여부만 표시.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    const baseSelect = `
      SELECT
        i.id, i.product_code, i.category, i.kind, i.barcode, i.name,
        i.created_by, i.created_at, i.updated_at,
        i.is_auto_created, i.scan_exempt,
        (i.image_data IS NOT NULL) AS has_image,
        u.nickname AS author_nickname
      FROM items i
      LEFT JOIN users u ON i.created_by = u.id
    `;

    const result =
      q === ""
        ? await query(
            `${baseSelect} WHERE i.deleted_at IS NULL ORDER BY i.created_at DESC`
          )
        : await query(
            `${baseSelect}
             WHERE i.deleted_at IS NULL
               AND (i.name ILIKE $1 OR i.barcode ILIKE $1 OR i.product_code ILIKE $1)
             ORDER BY i.created_at DESC`,
            [`%${q}%`]
          );

    await logAccess({
      session,
      action: "item.list",
      targetType: "item",
      request,
    });

    return NextResponse.json({ items: result.rows });
  } catch (error) {
    console.error("품목 목록 조회 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 새 품목 등록 (관리자 전용)
// multipart/form-data: product_code(선택), category(구분), kind(종류, 필수), barcode(선택), image(선택)
// name(품명)은 buildItemName(구분, 종류) = 정규화 품명으로 서버에서 조합 — 검수 매칭 키.
// 구분/종류는 입력 원본 보존. product_code·barcode 빈 문자열은 NULL 로 저장.
export async function POST(request: Request) {
  try {
    const authz = await requireAdmin();
    if (!authz.ok) return authz.response;
    const { session } = authz;

    const formData = await request.formData();
    const image = formData.get("image");
    const scanExempt = formData.get("scan_exempt") === "1";

    // 검증 + 정규화 품명 조합을 단일 헬퍼로 (엑셀·개별 일관) — name 은 정규화형
    const fields = buildItemFields({
      productCodeRaw: String(formData.get("product_code") ?? ""),
      category: String(formData.get("category") ?? ""),
      kind: String(formData.get("kind") ?? ""),
      barcodeRaw: String(formData.get("barcode") ?? ""),
    });
    if (!fields.ok) {
      return NextResponse.json({ error: fields.error }, { status: 400 });
    }
    const { name, category, kind, productCode, barcode } = fields;

    let imageBuffer: Buffer | null = null;
    let imageMime: string | null = null;
    if (image instanceof File && image.size > 0) {
      const parsed = await readUploadedImage(image);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      imageBuffer = parsed.buffer;
      imageMime = parsed.mime;
    }

    // 바코드는 중복 허용 (016에서 UNIQUE 제약 해제) — 같은 바코드 품목 여럿 OK.
    const result = await query(
      `INSERT INTO items
         (product_code, category, kind, barcode, name, image_data, image_mime, created_by, scan_exempt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, product_code, category, kind, barcode, name, created_by, created_at, scan_exempt,
                 (image_data IS NOT NULL) AS has_image`,
      [
        productCode,
        category,
        kind,
        barcode,
        name,
        imageBuffer,
        imageMime,
        session.user.id,
        scanExempt,
      ]
    );

    await logAccess({
      session,
      action: "item.create",
      targetType: "item",
      targetId: result.rows[0].id,
      request,
    });

    // 품목 목록 화면 캐시 무효화 (다음 조회 시 새로 렌더)
    revalidatePath("/warehouse/items");

    return NextResponse.json(
      { item: result.rows[0], message: "품목 등록 성공!" },
      { status: 201 }
    );
  } catch (error) {
    console.error("품목 등록 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
