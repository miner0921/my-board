import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────
// 정산 엑셀 파싱 ("만월회x더블에스 정산 N월.xlsx").
// 한 파일에 시트 4개가 들어 있고, 시트마다 원본 테이블 하나로 들어간다.
//   유통가공 세부내역 / 입출고 세부내역 → settlement_daily
//   출고현황                            → settlement_shipments
//   협의건                              → settlement_agreements
// '정산 내역서' 시트는 읽지 않는다 — 그건 이 시스템이 만들어내는 결과물이다.
//
// 시트가 일부만 들어있는 파일도 허용한다(있는 것만 갱신).
// ─────────────────────────────────────────────────────────────

// 라벨 매칭 키: 공백을 전부 없앤 것.
// 엑셀마다 'PLT 보 관' 처럼 자간용 공백이 들쭉날쭉해서 그대로는 못 맞춘다.
// (settlement.ts 가 이걸 가져다 쓴다 — 파서는 DB에 의존하지 않아야 단독 실행이 된다.)
export function labelKey(label: string): string {
  return label.replace(/\s+/g, "");
}

export type DailyRow = {
  source: "processing" | "inout_in" | "inout_out";
  label: string;
  workDate: string | null; // 'YYYY-MM-DD', 월말재고처럼 날짜 없는 값은 null
  qty: number;
};

export type ShipmentRow = {
  seq: number | null;
  kind: string;
  orderDate: string | null;
  trackingNo: string;
  orderNo: string;
  cancelReason: string;
  receiverName: string;
  receiverAddr: string;
  senderName: string;
  productName: string;
  settleType: "출고" | "반품" | "청구";
};

export type AgreementRow = {
  pickupDate: string | null;
  trackingNo: string;
  kind: string;
  freightTotal: number | null;
  receiverName: string;
  receiverAddr: string;
  productName: string;
  jejuLink: number | null;
};

export type SettlementParse = {
  daily: DailyRow[];
  shipments: ShipmentRow[];
  agreements: AgreementRow[];
  // 어떤 시트가 파일에 있었는지 — 있는 것만 DB에서 교체한다.
  found: {
    processing: boolean;
    inout: boolean;
    shipments: boolean;
    agreements: boolean;
  };
  warnings: string[];
};

type Cell = unknown;
type Grid = Cell[][];

const str = (v: Cell): string => (v === null || v === undefined ? "" : String(v).trim());

const num = (v: Cell): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// 엑셀 날짜 → 'YYYY-MM-DD'.
// 숫자면 시리얼(1899-12-30 기준), 문자열이면 앞 10자, Date면 UTC 기준으로 읽는다.
// 시리얼을 UTC로 환산해 UTC 게터로 읽어야 실행 환경 TZ에 흔들리지 않는다.
export function toDateStr(v: Cell): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v < 1 || v > 300000) return null;
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function grid(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}

// 헤더 행에서 라벨 위치 찾기. 공백 무시 + 부분일치(병합 셀 때문에 열 순서를 믿지 않는다).
function findCol(header: Cell[], ...names: string[]): number {
  const keys = names.map(labelKey);
  for (let c = 0; c < header.length; c++) {
    const cell = labelKey(str(header[c]));
    if (cell && keys.some((k) => cell === k || cell.includes(k))) return c;
  }
  return -1;
}

// 시트명도 공백이 흔들려서 정규화 후 부분일치로 찾는다.
function findSheet(wb: XLSX.WorkBook, ...names: string[]): XLSX.WorkSheet | null {
  const keys = names.map(labelKey);
  for (const n of wb.SheetNames) {
    const k = labelKey(n);
    if (keys.some((key) => k.includes(key))) return wb.Sheets[n] ?? null;
  }
  return null;
}

// ── 유통가공 세부내역 ────────────────────────────────
// A=구분(라벨) / B=합계(수식) / C~=일자별 수량.
// B(합계)는 저장하지 않고 일자별 값을 펼쳐 담는다 — 원본 수식이 틀려도 우리 합계는 맞는다.
// 다만 'PLT 보 관'처럼 일자 없이 월말 값만 있는 줄은 B를 날짜 없는 한 행으로 담는다.
function parseProcessing(ws: XLSX.WorkSheet, warnings: string[]): DailyRow[] {
  const g = grid(ws);
  if (g.length === 0) return [];
  const header = g[0] ?? [];
  const out: DailyRow[] = [];

  for (let r = 1; r < g.length; r++) {
    const row = g[r] ?? [];
    const label = str(row[0]);
    if (!label || labelKey(label) === "구분") continue;

    let dated = 0;
    for (let c = 2; c < row.length; c++) {
      const q = num(row[c]);
      if (q === null || q === 0) continue;
      const d = toDateStr(header[c]);
      if (d === null) {
        warnings.push(`유통가공 세부내역: ${label} — 날짜를 못 읽은 열이 있어 건너뜁니다.`);
        continue;
      }
      out.push({ source: "processing", label, workDate: d, qty: q });
      dated++;
    }

    // 일자별 값이 하나도 없으면 합계 열을 날짜 없는 한 행으로 담는다.
    // 합계가 0이어도 담는다 — 그래야 "그 달에 0건"과 "라벨이 바뀌어 못 찾음"이 구분된다.
    if (dated === 0) {
      out.push({ source: "processing", label, workDate: null, qty: num(row[1]) ?? 0 });
    }
  }
  return out;
}

// ── 입출고 세부내역 ──────────────────────────────────
// B=입고/출고 그룹(병합이라 첫 행에만 값) / C=라벨 / D=합계 / E~=일자별.
function parseInout(ws: XLSX.WorkSheet, warnings: string[]): DailyRow[] {
  const g = grid(ws);
  if (g.length === 0) return [];
  const header = g[0] ?? [];
  const out: DailyRow[] = [];
  let group: "inout_in" | "inout_out" | null = null;

  for (let r = 1; r < g.length; r++) {
    const row = g[r] ?? [];
    const groupCell = labelKey(str(row[1]));
    if (groupCell === "입고") group = "inout_in";
    else if (groupCell === "출고") group = "inout_out";

    const label = str(row[2]);
    if (!label || labelKey(label) === "총합계") continue;
    if (!group) {
      warnings.push(`입출고 세부내역: ${label} — 입고/출고 구분을 못 찾아 건너뜁니다.`);
      continue;
    }

    let dated = 0;
    for (let c = 4; c < row.length; c++) {
      const q = num(row[c]);
      if (q === null || q === 0) continue;
      const d = toDateStr(header[c]);
      if (d === null) continue;
      out.push({ source: group, label, workDate: d, qty: q });
      dated++;
    }
    // 0이어도 담는 이유는 유통가공 쪽과 같다 (0건 vs 라벨 못 찾음 구분)
    if (dated === 0) {
      out.push({ source: group, label, workDate: null, qty: num(row[3]) ?? 0 });
    }
  }
  return out;
}

// ── 출고현황 ─────────────────────────────────────────
// 헤더가 2행(1행 병합 + 2행 '수하인명/주소' 서브헤더)이라 운송장번호가 빈 행은 자동으로 걸러진다.
function parseShipments(ws: XLSX.WorkSheet, warnings: string[]): ShipmentRow[] {
  const g = grid(ws);
  if (g.length === 0) return [];
  const header = g[0] ?? [];

  const cSeq = findCol(header, "No");
  const cKind = findCol(header, "구분");
  const cDate = findCol(header, "최초지시일");
  const cTrack = findCol(header, "운송장번호");
  const cOrder = findCol(header, "주문번호");
  const cCancel = findCol(header, "취소사유");
  const cRecv = findCol(header, "수하인");
  const cSend = findCol(header, "송하인");
  const cProd = findCol(header, "상품명");

  if (cTrack < 0 || cKind < 0) {
    warnings.push("출고현황: '운송장번호' 또는 '구분' 열을 찾지 못했습니다.");
    return [];
  }

  const out: ShipmentRow[] = [];
  let skipped = 0;
  for (let r = 1; r < g.length; r++) {
    const row = g[r] ?? [];
    const trackingNo = str(row[cTrack]);
    if (!trackingNo) continue; // 서브헤더 / 빈 행

    const kind = str(row[cKind]);
    const orderNo = cOrder >= 0 ? str(row[cOrder]) : "";

    // 정산 분류: 반품 / 청구(출고인데 주문번호에 '청구') / 나머지 출고
    let settleType: ShipmentRow["settleType"];
    if (kind === "반품") settleType = "반품";
    else if (kind === "출고") settleType = orderNo.includes("청구") ? "청구" : "출고";
    else {
      skipped++;
      continue;
    }

    out.push({
      seq: cSeq >= 0 ? num(row[cSeq]) : null,
      kind,
      orderDate: cDate >= 0 ? toDateStr(row[cDate]) : null,
      trackingNo,
      orderNo,
      cancelReason: cCancel >= 0 ? str(row[cCancel]) : "",
      receiverName: cRecv >= 0 ? str(row[cRecv]) : "",
      // 수하인은 '명 / 주소' 두 칸이 병합 헤더 하나를 쓴다 — 바로 오른쪽이 주소.
      receiverAddr: cRecv >= 0 ? str(row[cRecv + 1]) : "",
      senderName: cSend >= 0 ? str(row[cSend]) : "",
      productName: cProd >= 0 ? str(row[cProd]) : "",
      settleType,
    });
  }
  if (skipped > 0) {
    warnings.push(`출고현황: 구분이 '출고'/'반품'이 아닌 ${skipped}건을 제외했습니다.`);
  }
  return out;
}

// ── 협의건 ───────────────────────────────────────────
function parseAgreements(ws: XLSX.WorkSheet, warnings: string[]): AgreementRow[] {
  const g = grid(ws);
  if (g.length === 0) return [];
  const header = g[0] ?? [];

  const cDate = findCol(header, "집하일자");
  const cTrack = findCol(header, "운송장번호");
  const cKind = findCol(header, "작업구분");
  const cFreight = findCol(header, "운임합계");
  const cName = findCol(header, "수하인명");
  const cAddr = findCol(header, "수하인주소");
  const cProd = findCol(header, "상품명");
  const cJeju = findCol(header, "제주연계");

  if (cTrack < 0) {
    warnings.push("협의건: '운송장번호' 열을 찾지 못했습니다.");
    return [];
  }

  const out: AgreementRow[] = [];
  for (let r = 1; r < g.length; r++) {
    const row = g[r] ?? [];
    const trackingNo = str(row[cTrack]);
    if (!trackingNo) continue;
    out.push({
      pickupDate: cDate >= 0 ? toDateStr(row[cDate]) : null,
      trackingNo,
      kind: cKind >= 0 ? str(row[cKind]) : "",
      freightTotal: cFreight >= 0 ? num(row[cFreight]) : null,
      receiverName: cName >= 0 ? str(row[cName]) : "",
      receiverAddr: cAddr >= 0 ? str(row[cAddr]) : "",
      productName: cProd >= 0 ? str(row[cProd]) : "",
      jejuLink: cJeju >= 0 ? num(row[cJeju]) : null,
    });
  }
  return out;
}

export function parseSettlementWorkbook(buffer: Buffer): SettlementParse {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const warnings: string[] = [];

  const wsProc = findSheet(wb, "유통가공세부내역", "유통가공");
  const wsInout = findSheet(wb, "입출고세부내역", "입출고");
  const wsShip = findSheet(wb, "출고현황");
  const wsAgr = findSheet(wb, "협의건");

  const daily: DailyRow[] = [];
  if (wsProc) daily.push(...parseProcessing(wsProc, warnings));
  if (wsInout) daily.push(...parseInout(wsInout, warnings));

  const found = {
    processing: !!wsProc,
    inout: !!wsInout,
    shipments: !!wsShip,
    agreements: !!wsAgr,
  };
  if (!found.processing && !found.inout && !found.shipments && !found.agreements) {
    warnings.push(
      "인식할 시트가 없습니다. 시트명이 '유통가공 세부내역' / '입출고 세부내역' / '출고현황' / '협의건' 인지 확인하세요."
    );
  }

  return {
    daily,
    shipments: wsShip ? parseShipments(wsShip, warnings) : [],
    agreements: wsAgr ? parseAgreements(wsAgr, warnings) : [],
    found,
    warnings,
  };
}
