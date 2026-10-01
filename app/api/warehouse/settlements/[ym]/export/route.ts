import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth-helper";
import {
  PARTIES,
  SECTIONS,
  isValidYm,
  loadSettlement,
} from "@/lib/settlement";

// ─────────────────────────────────────────────────────────────
// GET /api/warehouse/settlements/[ym]/export — 정산내역서 엑셀 내려받기 (관리자)
//
// 화면과 같은 loadSettlement() 결과를 쓴다 — 숫자가 어긋날 자리가 없다.
// 원본 파일의 셀 병합·테두리까지 흉내내지는 않는다(값이 목적).
// ─────────────────────────────────────────────────────────────

type Params = { params: Promise<{ ym: string }> };
type Row = (string | number | null)[];

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { ym } = await params;
    if (!isValidYm(ym)) {
      return NextResponse.json({ error: "정산 월 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const data = await loadSettlement(ym);
    if (!data) {
      return NextResponse.json({ error: "정산 월을 찾을 수 없습니다." }, { status: 404 });
    }

    const month = Number(ym.slice(5, 7));
    const s = PARTIES.supplier;
    const c = PARTIES.client;

    const aoa: Row[] = [
      [`${month}월 물류대행 내역서`],
      [],
      ["구분", "등록번호", "상호", "대표자명", "주소", "업태", "종목"],
      [s.title, s.bizNo, s.name, s.ceo, s.address, s.bizType, s.bizItem],
      [c.title, c.bizNo, c.name, c.ceo, c.address, c.bizType, c.bizItem],
      [],
      ["구 분", "세부항목", "비 고", "단 가 (vat 포함)", "수 량", "합 계"],
    ];

    for (const sec of SECTIONS) {
      const lines = data.lines.filter((l) => l.section === sec.key);
      if (lines.length === 0) continue;
      lines.forEach((l, i) => {
        aoa.push([
          i === 0 ? sec.label : "",
          l.name,
          l.note,
          l.unitPrice,
          l.qty === null ? "-" : l.qty,
          Math.round(l.amount),
        ]);
      });
      aoa.push(["", "", "", "", "합 계", Math.round(data.sectionTotals[sec.key] ?? 0)]);
    }
    aoa.push(["", "", "", "", "당월 계", Math.round(data.total)]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 16 }, { wch: 20 }, { wch: 38 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "정산 내역서");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const filename = `정산내역서_${ym}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // 한글 파일명은 filename* (RFC 5987) 로만 안전하게 전달된다.
        "Content-Disposition": `attachment; filename="settlement_${ym}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("정산 엑셀 내보내기 실패:", e);
    return NextResponse.json({ error: "엑셀을 만들지 못했습니다." }, { status: 500 });
  }
}
