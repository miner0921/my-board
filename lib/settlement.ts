import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import {
  labelKey,
  type AgreementRow,
  type DailyRow,
  type ShipmentRow,
} from "@/lib/settlement-parse";

export { labelKey };

// ─────────────────────────────────────────────────────────────
// 정산 관리 공용 — 거래처 정보 / 섹션 정의 / 기본 항목 템플릿 / 자동 수량 집계.
//
// 정산내역서 한 행 = 단가 × 수량. 단가는 전부 VAT 포함이라 배수·나눗셈이 없다.
// 수량은 두 종류뿐:
//   qty_source 있음 → 업로드 원본(출고현황/협의건/세부내역)에서 자동 집계
//   qty_source 없음 → 사람이 직접 입력
// ─────────────────────────────────────────────────────────────

// 매달 고정이라 테이블로 만들지 않는다. 바뀌면 이 상수만 고친다.
export const PARTIES = {
  supplier: {
    title: "공급자",
    bizNo: "103-87-03461",
    name: "더블에스로지스",
    ceo: "손창민",
    address: "충청남도 천안시 서북구 성거읍 모전리 85 , 8동",
    bizType: "운수 및 창고업",
    bizItem: "화물 포장, 검수 및 계량 서비스업",
  },
  client: {
    title: "공급받는자",
    bizNo: "665-86-01867",
    name: "주식회사 만월회",
    ceo: "박제영",
    address:
      "경기도 용인시 기흥구 서천로201번길 14,355호(농서동,프리미엄원희캐슬)",
    bizType: "제조업,도매 및 소매업",
    bizItem: "기타 비알코올 음료 제조업 전자상거래 소매업",
  },
} as const;

export const SECTIONS = [
  { key: "courier", label: "택배비 (롯데택배)" },
  { key: "packing", label: "패킹비" },
  { key: "material", label: "부자재비" },
  { key: "inout", label: "입출고비" },
  { key: "storage", label: "보관비" },
  { key: "processing", label: "유통가공비" },
  { key: "etc", label: "기 타" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s.label])
);

export type LineTemplate = {
  section: SectionKey;
  name: string;
  note: string;
  unitPrice: number;
  qtySource: string | null;
  noQty?: boolean; // 수량 칸에 '-' 를 쓰는 줄 (기타 섹션)
};

// 새 월을 만들 때 깔리는 기본 항목. 단가는 2026-08 기준.
// 직전 월이 있으면 이 템플릿 대신 그 달의 구성·단가를 복사한다.
export const DEFAULT_LINES: LineTemplate[] = [
  // ── 택배비
  { section: "courier", name: "출 고", note: "타입 무관 (청구건 포함)", unitPrice: 2800, qtySource: "ship:out" },
  { section: "courier", name: "반 품", note: "타입 무관", unitPrice: 2800, qtySource: "ship:return" },
  { section: "courier", name: "항공, 도선료", note: "추가 운임", unitPrice: 3500, qtySource: "agr:count" },
  { section: "courier", name: "청구", note: "누락,오배송", unitPrice: -2800, qtySource: "ship:claim" },
  // ── 패킹비
  { section: "packing", name: "일반 택배", note: "아이스박스", unitPrice: 1100, qtySource: "proc:icebox_all" },
  { section: "packing", name: "단순 송장", note: "박스 단위", unitPrice: 500, qtySource: "proc:단순송장" },
  { section: "packing", name: "카톤 박스", note: "만월회 로고 종이 박스", unitPrice: 500, qtySource: "proc:카톤박스" },
  // ── 부자재비
  { section: "material", name: "아이스박스(대)", note: "유통 6팩 / 내경 : 335*250*215(15)", unitPrice: 1317.8, qtySource: "proc:아이스박스(대)" },
  { section: "material", name: "아이스박스(소)", note: "ZZB(찐빵 박스) / 내경 : 275*205*135(30)", unitPrice: 713.9, qtySource: "proc:아이스박스(소)" },
  { section: "material", name: "아이스팩 (중)", note: "하계 : 내추럴 플러스 / 동계 : 단일 필름", unitPrice: 165, qtySource: null },
  { section: "material", name: "", note: "PCM 아이스팩 15*20", unitPrice: 330, qtySource: null },
  { section: "material", name: "골판지박스(소)", note: "내경 200*200*245(스프레드 소분 박스)", unitPrice: 550, qtySource: null },
  { section: "material", name: "골판지박스(대)", note: "내경 400*300*350(합포장 박스)", unitPrice: 987, qtySource: null },
  { section: "material", name: "테이프", note: "분기마다 정산", unitPrice: 15, qtySource: null },
  { section: "material", name: "롤 랩", note: "30mmx500mmx200m", unitPrice: 64000, qtySource: null },
  // ── 입출고비
  { section: "inout", name: "수작업", note: "다마스", unitPrice: 5000, qtySource: "inout:다마스" },
  { section: "inout", name: "", note: "2.5t 이하", unitPrice: 10000, qtySource: "inout:2.5톤이하(수작업)" },
  { section: "inout", name: "", note: "5t 이하", unitPrice: 20000, qtySource: "inout:5톤이하(수작업)" },
  { section: "inout", name: "", note: "컨테이너(40FT-10K미만)", unitPrice: 550000, qtySource: "inout:컨테이너(40FT-10K미만)" },
  { section: "inout", name: "", note: "컨테이너(40FT-10K이상)", unitPrice: 700000, qtySource: "inout:컨테이너(40FT-10K이상)" },
  { section: "inout", name: "지게차", note: "1pt 당", unitPrice: 2000, qtySource: "inout:forklift" },
  // ── 보관비
  { section: "storage", name: "PLT", note: "월말 재고 기준", unitPrice: 25000, qtySource: "proc:PLT보관" },
  { section: "storage", name: "P박스", note: "월말 재고 기준", unitPrice: 600, qtySource: "proc:P보관" },
  // ── 유통가공비
  { section: "processing", name: "팩파우치 1개입", note: "검수 및 외포장", unitPrice: 100, qtySource: "proc:팩파우치1개입" },
  { section: "processing", name: "팩파우치 4개입", note: "검수 및 외포장", unitPrice: 150, qtySource: "proc:팩파우치4개입" },
  { section: "processing", name: "팩파우치 10개입", note: "검수 및 외포장", unitPrice: 150, qtySource: "proc:팩파우치10개입" },
  { section: "processing", name: "3종 선물세트", note: "검수 및 외포장", unitPrice: 300, qtySource: "proc:3종선물세트" },
  { section: "processing", name: "B2C 구성 부자재", note: "검수 및 외포장", unitPrice: 100, qtySource: "proc:B2C구성부자재" },
  { section: "processing", name: "B2C (뾱뾱이)", note: "검수 및 외포장", unitPrice: 200, qtySource: "proc:B2C부자재(뾱뾱이)" },
  // ── 기타: 매달 내용이 달라 빈 줄로 시작한다 (고객 보상 차감 등)
  { section: "etc", name: "", note: "", unitPrice: 0, qtySource: null, noQty: true },
  { section: "etc", name: "", note: "", unitPrice: 0, qtySource: null, noQty: true },
  { section: "etc", name: "", note: "", unitPrice: 0, qtySource: null, noQty: true },
];

// 자동 수량 출처를 사람이 읽는 말로. 화면에서 자동 칸 옆에 표시한다.
const SOURCE_LABELS: Record<string, string> = {
  "ship:out": "출고현황 · 출고(청구 포함)",
  "ship:return": "출고현황 · 반품",
  "ship:claim": "출고현황 · 청구",
  "agr:count": "협의건 · 전체 건수",
  "proc:icebox_all": "유통가공 · 아이스박스 대+소",
  "inout:forklift": "입출고 · 1PLT 작업 전체",
};

export function sourceLabel(key: string | null): string {
  if (!key) return "";
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  const [prefix, label] = key.split(":");
  const sheet =
    prefix === "proc" ? "유통가공" : prefix === "inout" ? "입출고" : prefix;
  return `${sheet} · ${label}`;
}

export type AutoQty = Record<string, number>;

// 업로드 원본 3종을 집계해 qty_source 키별 수량을 만든다.
// 캐시 테이블을 두지 않는다 — 원본이 곧 진실이고, 월당 집계 결과가 수십 행이라 매번 세도 싸다.
export async function computeAutoQty(monthId: number): Promise<AutoQty> {
  const [ship, agr, daily] = await Promise.all([
    query(
      `SELECT settle_type, COUNT(*)::int AS cnt
         FROM settlement_shipments WHERE month_id = $1 GROUP BY settle_type`,
      [monthId]
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM settlement_agreements WHERE month_id = $1`,
      [monthId]
    ),
    query(
      `SELECT source, label, SUM(qty)::float8 AS qty
         FROM settlement_daily WHERE month_id = $1 GROUP BY source, label`,
      [monthId]
    ),
  ]);

  const byType: Record<string, number> = {};
  for (const r of ship.rows) byType[r.settle_type] = r.cnt;

  const map: AutoQty = {
    // 원본 내역서와 같은 구조 — 출고 수량은 청구건을 포함한 전체다.
    // 청구 줄이 같은 건수를 마이너스 단가로 상계해 실질 0원이 된다.
    "ship:out": (byType["출고"] ?? 0) + (byType["청구"] ?? 0),
    "ship:return": byType["반품"] ?? 0,
    "ship:claim": byType["청구"] ?? 0,
    "agr:count": agr.rows[0]?.cnt ?? 0,
  };

  for (const r of daily.rows) {
    // 입고/출고는 한 항목으로 합산한다 (정산 항목이 '수작업 2.5t' 하나뿐).
    const prefix = r.source === "processing" ? "proc" : "inout";
    const key = `${prefix}:${labelKey(r.label)}`;
    map[key] = (map[key] ?? 0) + Number(r.qty);
  }

  // 파생 항목 — 세부내역에 대응하는 줄이 없어 합쳐야 나오는 값
  map["proc:icebox_all"] =
    (map["proc:아이스박스(대)"] ?? 0) + (map["proc:아이스박스(소)"] ?? 0);
  map["inout:forklift"] =
    (map["inout:2.5톤이하(1PLT)"] ?? 0) + (map["inout:5톤이하(1PLT)"] ?? 0);

  return map;
}

// 화면·엑셀·합계가 같은 값을 쓰도록 금액 계산은 여기 하나로.
export function lineAmount(unitPrice: number, qty: number | null): number {
  if (qty === null) return unitPrice; // 수량이 '-' 인 줄은 단가가 곧 금액
  return unitPrice * qty;
}

export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

// 'YYYY-MM' 검증
export function isValidYm(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

// ─────────────────────────────────────────────────────────────
// 정산 한 달치 로드 — 화면과 엑셀 내보내기가 같은 함수를 쓴다.
// 자동 줄의 수량은 DB(settlement_lines.qty)가 아니라 항상 원본 집계에서 가져온다.
// DB 의 qty 칸은 수동 줄 전용이다.
// ─────────────────────────────────────────────────────────────

export type ResolvedLine = {
  id: number;
  section: string;
  name: string;
  note: string;
  unitPrice: number;
  qty: number | null;
  qtySource: string | null;
  auto: boolean;
  // 자동 줄인데 원본에서 그 라벨을 못 찾은 경우(엑셀 항목명이 바뀐 것). 0 과 구분해야 한다.
  missing: boolean;
  amount: number;
};

export type LoadedSettlement = {
  month: {
    id: number;
    ym: string;
    status: string;
    createdAt: string;
    confirmedAt: string | null;
    confirmedBy: string | null;
  };
  lines: ResolvedLine[];
  sectionTotals: Record<string, number>;
  total: number;
  uploads: {
    processing: number;
    inout: number;
    shipments: number;
    agreements: number;
  };
};

export async function loadSettlement(ym: string): Promise<LoadedSettlement | null> {
  const mRes = await query(
    `SELECT m.id, m.ym, m.status, m.created_at, m.confirmed_at, u.nickname
       FROM settlement_months m
       LEFT JOIN users u ON u.id = m.confirmed_by
      WHERE m.ym = $1`,
    [ym]
  );
  const m = mRes.rows[0];
  if (!m) return null;

  const [lineRes, autoQty, upRes] = await Promise.all([
    query(
      `SELECT id, section, name, note, unit_price, qty, qty_source
         FROM settlement_lines WHERE month_id = $1 ORDER BY sort_no, id`,
      [m.id]
    ),
    computeAutoQty(m.id),
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM settlement_daily
           WHERE month_id = $1 AND source = 'processing')                    AS processing,
         (SELECT COUNT(*)::int FROM settlement_daily
           WHERE month_id = $1 AND source IN ('inout_in','inout_out'))       AS inout,
         (SELECT COUNT(*)::int FROM settlement_shipments WHERE month_id = $1) AS shipments,
         (SELECT COUNT(*)::int FROM settlement_agreements WHERE month_id = $1) AS agreements`,
      [m.id]
    ),
  ]);

  const sectionTotals: Record<string, number> = {};
  const lines: ResolvedLine[] = lineRes.rows.map((r) => {
    const auto = r.qty_source !== null;
    const missing = auto && !(r.qty_source in autoQty);
    const qty = auto
      ? autoQty[r.qty_source] ?? 0
      : r.qty === null
        ? null
        : Number(r.qty);
    const unitPrice = Number(r.unit_price);
    const amount = lineAmount(unitPrice, qty);
    sectionTotals[r.section] = (sectionTotals[r.section] ?? 0) + amount;
    return {
      id: r.id,
      section: r.section,
      name: r.name,
      note: r.note,
      unitPrice,
      qty,
      qtySource: r.qty_source,
      auto,
      missing,
      amount,
    };
  });

  return {
    month: {
      id: m.id,
      ym: m.ym,
      status: m.status,
      createdAt: m.created_at,
      confirmedAt: m.confirmed_at,
      confirmedBy: m.nickname,
    },
    lines,
    sectionTotals,
    total: Object.values(sectionTotals).reduce((a, b) => a + b, 0),
    uploads: upRes.rows[0],
  };
}

// ─────────────────────────────────────────────────────────────
// 업로드 원본 대량 삽입.
// 출고현황이 월 3천 행대라 행마다 INSERT 하면 파라미터 상한에 걸린다.
// 열 단위 배열 하나씩만 넘기고 UNNEST 로 펼쳐 한 번에 넣는다.
// ─────────────────────────────────────────────────────────────

// 행 배열 → 열 배열 (UNNEST 인자 모양)
function columns<T, K extends keyof T>(rows: T[], keys: K[]): T[K][][] {
  return keys.map((k) => rows.map((r) => r[k]));
}

export async function insertDaily(
  client: PoolClient,
  monthId: number,
  rows: DailyRow[]
) {
  if (rows.length === 0) return;
  const cols = columns(rows, ["source", "label", "workDate", "qty"]);
  await client.query(
    `INSERT INTO settlement_daily (month_id, source, label, work_date, qty)
     SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::date[], $5::numeric[])`,
    [monthId, ...cols]
  );
}

export async function insertShipments(
  client: PoolClient,
  monthId: number,
  rows: ShipmentRow[]
) {
  if (rows.length === 0) return;
  const cols = columns(rows, [
    "seq", "kind", "orderDate", "trackingNo", "orderNo", "cancelReason",
    "receiverName", "receiverAddr", "senderName", "productName", "settleType",
  ]);
  await client.query(
    `INSERT INTO settlement_shipments
       (month_id, seq, kind, order_date, tracking_no, order_no, cancel_reason,
        receiver_name, receiver_addr, sender_name, product_name, settle_type)
     SELECT $1, * FROM UNNEST(
       $2::int[], $3::text[], $4::date[], $5::text[], $6::text[], $7::text[],
       $8::text[], $9::text[], $10::text[], $11::text[], $12::text[])`,
    [monthId, ...cols]
  );
}

export async function insertAgreements(
  client: PoolClient,
  monthId: number,
  rows: AgreementRow[]
) {
  if (rows.length === 0) return;
  const cols = columns(rows, [
    "pickupDate", "trackingNo", "kind", "freightTotal",
    "receiverName", "receiverAddr", "productName", "jejuLink",
  ]);
  await client.query(
    `INSERT INTO settlement_agreements
       (month_id, pickup_date, tracking_no, kind, freight_total,
        receiver_name, receiver_addr, product_name, jeju_link)
     SELECT $1, * FROM UNNEST(
       $2::date[], $3::text[], $4::text[], $5::numeric[],
       $6::text[], $7::text[], $8::text[], $9::numeric[])`,
    [monthId, ...cols]
  );
}
