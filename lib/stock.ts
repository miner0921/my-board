import type { PoolClient } from "pg";

// ─────────────────────────────────────────────────────────────
// 재고 로직 한 곳. 입고 / 차감 / 송장 연동(차감·원복) 전부 여기서만 한다.
// 호출 측(API 라우트, 스캔 훅)은 이 함수들만 부르고 SQL을 다시 짜지 않는다.
//
// 핵심 규칙 — 차감 순서
//   ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC
//     - 소비기한 있는 로트 → 소비기한 빠른 것부터 (FEFO)
//     - 소비기한 없는 로트(NULL) → 뒤로 밀리고, 그들끼리는 입고일 빠른 것부터 (FIFO)
//   품목이 "소비기한 관리 대상인지"로 분기하지 않는다. 로트의 expiry_date 유무가 전부다.
//
// 핵심 규칙 — 원복
//   송장 완료 차감은 "어느 로트에서 몇 개" 뺐는지 item_stock_movements 에 남긴다.
//   재개(완료→진행중) 시 FEFO를 역산하지 않고 그 로트에 그대로 되돌린다.
//   → 소비기한이 어긋날 수 없다.
// ─────────────────────────────────────────────────────────────

export type StockReason =
  | "inbound" // 입고 (+)
  | "manual_out" // 수동 출고 (-)
  | "invoice_out" // 송장 검수 완료 차감 (-)
  | "invoice_return" // 송장 재개 원복 (+)
  | "adjust_in" // 재고 조정 증가 (+) — 049
  | "adjust_out"; // 재고 조정 감소 (-) — 049

// 차감 순서. 이 문자열을 바꾸는 것 = 재고 정책을 바꾸는 것.
export const LOT_ORDER_SQL =
  "ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC";

// 'YYYY-MM-DD' 만 통과시킨다. 빈값·다른 형식은 null(= 미지정).
export function toDateStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

type LotRow = {
  id: number;
  expiry_date: string | null; // 'YYYY-MM-DD'
  received_date: string;
};

// ── 로트 upsert: 같은 (품목, 소비기한, 입고일)이면 수량만 더한다 ──
async function upsertLot(
  client: PoolClient,
  o: {
    itemId: number;
    quantity: number;
    expiryDate?: string | null;
    receivedDate?: string | null;
    memo?: string | null;
    userId: number;
  }
): Promise<LotRow> {
  const res = await client.query(
    `INSERT INTO item_lots (item_id, expiry_date, received_date, quantity, memo, created_by)
     VALUES ($1, $2::date, COALESCE($3::date, CURRENT_DATE), $4, $5, $6)
     ON CONFLICT (item_id, COALESCE(expiry_date, DATE '0001-01-01'), received_date)
     DO UPDATE SET quantity   = item_lots.quantity + EXCLUDED.quantity,
                   updated_at = NOW()
     RETURNING id, expiry_date::text AS expiry_date, received_date::text AS received_date`,
    [
      o.itemId,
      o.expiryDate ?? null,
      o.receivedDate ?? null,
      o.quantity,
      o.memo ?? null,
      o.userId,
    ]
  );
  return res.rows[0] as LotRow;
}

// ── 이력 1행 기록 ──
async function insertMovement(
  client: PoolClient,
  o: {
    itemId: number;
    lotId: number | null;
    delta: number;
    reason: StockReason;
    invoiceId?: number | null;
    receiptId?: number | null;
    expiryDate?: string | null;
    receivedDate?: string | null;
    memo?: string | null;
    userId: number;
  }
) {
  await client.query(
    `INSERT INTO item_stock_movements
       (item_id, lot_id, delta, reason, invoice_id, receipt_id,
        expiry_date, received_date, memo, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10)`,
    [
      o.itemId,
      o.lotId,
      o.delta,
      o.reason,
      o.invoiceId ?? null,
      o.receiptId ?? null,
      o.expiryDate ?? null,
      o.receivedDate ?? null,
      o.memo ?? null,
      o.userId,
    ]
  );
}

// ── 입고 ──
// 소비기한 없는 품목은 expiryDate 를 넘기지 않으면 된다(NULL 로트 = 입고일 순 차감 대상).
export async function receiveStock(
  client: PoolClient,
  o: {
    itemId: number;
    quantity: number;
    expiryDate?: string | null;
    receivedDate?: string | null;
    memo?: string | null;
    receiptId?: number | null;
    // 기본은 실제 입고. 재고 조정으로 늘리는 경우만 adjust_in 을 넘긴다(049).
    reason?: Extract<StockReason, "inbound" | "adjust_in">;
    userId: number;
  }
): Promise<number> {
  if (!Number.isInteger(o.quantity) || o.quantity <= 0) {
    throw new Error("입고 수량은 1 이상의 정수여야 합니다.");
  }
  const lot = await upsertLot(client, o);
  await insertMovement(client, {
    itemId: o.itemId,
    lotId: lot.id,
    delta: o.quantity,
    reason: o.reason ?? "inbound",
    receiptId: o.receiptId ?? null,
    expiryDate: lot.expiry_date,
    receivedDate: lot.received_date,
    memo: o.memo ?? null,
    userId: o.userId,
  });
  return lot.id;
}

// ── 로트 수량을 목표값으로 맞추기 (재고 조정 — 050) ──
// 입출고와 다르다: FEFO를 타지 않고 "이 로트를 몇 개로 만든다"만 한다.
// 목표와 지금 잔량의 차이만큼 움직이고 그 차이를 이력에 남긴다(늘면 adjust_in, 줄면 adjust_out).
// 로트가 없으면(새 소비기한) 0짜리 로트를 만들고 목표까지 올린다.
export async function setLotQuantity(
  client: PoolClient,
  o: {
    itemId: number;
    lotId?: number | null;
    expiryDate?: string | null;
    receivedDate?: string | null;
    target: number;
    memo?: string | null;
    userId: number;
  }
): Promise<{ lotId: number; delta: number }> {
  if (!Number.isInteger(o.target) || o.target < 0) {
    throw new Error("조정 수량은 0 이상의 정수여야 합니다.");
  }

  type Row = LotRow & { quantity: number };
  const cols = `id, quantity, expiry_date::text AS expiry_date, received_date::text AS received_date`;

  // 대상 로트: id 우선, 없으면 (품목, 소비기한, 입고일) 키로 찾는다.
  let lot: Row | null = null;
  if (o.lotId) {
    const r = await client.query(
      `SELECT ${cols} FROM item_lots WHERE id = $1 AND item_id = $2 FOR UPDATE`,
      [o.lotId, o.itemId]
    );
    lot = (r.rows[0] as Row) ?? null;
  }
  if (!lot) {
    const r = await client.query(
      `SELECT ${cols} FROM item_lots
        WHERE item_id = $1
          AND COALESCE(expiry_date, DATE '0001-01-01')
              = COALESCE($2::date, DATE '0001-01-01')
          AND received_date = COALESCE($3::date, CURRENT_DATE)
        FOR UPDATE`,
      [o.itemId, o.expiryDate ?? null, o.receivedDate ?? null]
    );
    lot = (r.rows[0] as Row) ?? null;
  }
  if (!lot) {
    const r = await client.query(
      `INSERT INTO item_lots (item_id, expiry_date, received_date, quantity, memo, created_by)
       VALUES ($1, $2::date, COALESCE($3::date, CURRENT_DATE), 0, $4, $5)
       RETURNING ${cols}`,
      [o.itemId, o.expiryDate ?? null, o.receivedDate ?? null, o.memo ?? null, o.userId]
    );
    lot = r.rows[0] as Row;
  }

  const delta = o.target - Number(lot.quantity);
  if (delta === 0) return { lotId: lot.id, delta: 0 };

  await client.query(
    `UPDATE item_lots SET quantity = $1, updated_at = NOW() WHERE id = $2`,
    [o.target, lot.id]
  );
  await insertMovement(client, {
    itemId: o.itemId,
    lotId: lot.id,
    delta,
    reason: delta > 0 ? "adjust_in" : "adjust_out",
    expiryDate: lot.expiry_date,
    receivedDate: lot.received_date,
    memo: o.memo ?? null,
    userId: o.userId,
  });
  return { lotId: lot.id, delta };
}

// ── 차감 (FEFO → 입고일 순) ──
// 재고가 모자라도 막지 않는다 — 부족분만큼 로트 수량이 음수로 내려간다(047).
// 현장에서 "재고엔 없는데 실제로 나간" 상황을 그대로 장부에 남기기 위함.
// 나중에 입고가 들어오면 합계가 자연히 메워진다.
export async function deductStock(
  client: PoolClient,
  o: {
    itemId: number;
    quantity: number;
    reason: Extract<StockReason, "manual_out" | "invoice_out" | "adjust_out">;
    invoiceId?: number | null;
    memo?: string | null;
    userId: number;
  }
): Promise<{ deducted: number; negative: number }> {
  if (!Number.isInteger(o.quantity) || o.quantity <= 0) {
    throw new Error("출고 수량은 1 이상의 정수여야 합니다.");
  }

  // FOR UPDATE — 같은 품목을 동시에 차감하는 요청끼리 순서를 세운다(이중 차감 방지).
  const lots = await client.query(
    `SELECT id, quantity,
            expiry_date::text   AS expiry_date,
            received_date::text AS received_date
       FROM item_lots
      WHERE item_id = $1 AND quantity > 0
      ${LOT_ORDER_SQL}
      FOR UPDATE`,
    [o.itemId]
  );

  const takeFrom = async (lot: LotRow, qty: number) => {
    await client.query(
      `UPDATE item_lots SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
      [qty, lot.id]
    );
    await insertMovement(client, {
      itemId: o.itemId,
      lotId: lot.id,
      delta: -qty,
      reason: o.reason,
      invoiceId: o.invoiceId ?? null,
      expiryDate: lot.expiry_date,
      receivedDate: lot.received_date,
      memo: o.memo ?? null,
      userId: o.userId,
    });
  };

  let remain = o.quantity;
  let lastLot: LotRow | null = null;
  for (const lot of lots.rows as (LotRow & { quantity: number })[]) {
    if (remain <= 0) break;
    const take = Math.min(Number(lot.quantity), remain);
    await takeFrom(lot, take);
    remain -= take;
    lastLot = lot;
  }

  if (remain > 0) {
    // 남은 만큼은 마이너스로 내려간다. 붙일 로트를 고르는 순서:
    //   1) 방금까지 빼던 로트   2) (양수 로트가 없었으면) 기존 로트 중 차감 순서상 마지막
    //   3) 그것도 없으면(입고 이력 자체가 없는 품목) 소비기한 없는 오늘자 로트를 만든다
    let target = lastLot;
    if (!target) {
      const any = await client.query(
        `SELECT id, expiry_date::text AS expiry_date, received_date::text AS received_date
           FROM item_lots WHERE item_id = $1
          ${LOT_ORDER_SQL}
          FOR UPDATE`,
        [o.itemId]
      );
      target = (any.rows[any.rows.length - 1] as LotRow) ?? null;
    }
    if (!target) {
      target = await upsertLot(client, {
        itemId: o.itemId,
        quantity: 0,
        userId: o.userId,
      });
    }
    await takeFrom(target, remain);
  }

  return { deducted: o.quantity, negative: remain };
}

// ── 송장 완료 → 재고 차감 (멱등) ──
// 완료 처리 트랜잭션 안에서, status 를 UPDATE 한 "뒤에" 부른다.
//
// 차감 수량 기준
//   - 기본: scanned_count (실제 챙긴 수량 = 실제 나간 수량)
//   - manual_completed 송장 / inspection_exempt(스캔불필요) 품목: quantity
//     (스캔은 안 하지만 물건은 나가므로)
//   - excluded_at 있는 행(제외 품목): 차감 안 함
export async function deductForInvoice(
  client: PoolClient,
  invoiceId: number,
  userId: number
): Promise<void> {
  // 이미 차감돼 있으면(원복 안 된 출고 이력 존재) 아무것도 안 한다.
  const dup = await client.query(
    `SELECT 1 FROM item_stock_movements
      WHERE invoice_id = $1 AND reason = 'invoice_out' AND reversed_at IS NULL
      LIMIT 1`,
    [invoiceId]
  );
  if (dup.rows.length > 0) return;

  const inv = await client.query(`SELECT status FROM invoices WHERE id = $1`, [
    invoiceId,
  ]);
  if (inv.rows.length === 0) return;
  const isManual = inv.rows[0].status === "manual_completed";

  const rows = await client.query(
    `SELECT ii.item_id,
            CASE WHEN $2 OR it.inspection_exempt THEN ii.quantity
                 ELSE ii.scanned_count END AS qty
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
      WHERE ii.invoice_id = $1 AND ii.excluded_at IS NULL
      ORDER BY ii.item_id`,
    [invoiceId, isManual]
  );

  for (const r of rows.rows) {
    const qty = Number(r.qty) || 0;
    if (qty <= 0) continue;
    await deductStock(client, {
      itemId: Number(r.item_id),
      quantity: qty,
      reason: "invoice_out",
      invoiceId,
      userId,
    });
  }
}

// ── 송장 재개(완료→진행중) → 재고 원복 (멱등) ──
// 차감했던 로트에 그대로 되돌린다. 원복할 이력이 없으면 조용히 끝난다.
export async function restoreForInvoice(
  client: PoolClient,
  invoiceId: number,
  userId: number
): Promise<void> {
  const outs = await client.query(
    `SELECT id, item_id, lot_id, delta,
            expiry_date::text   AS expiry_date,
            received_date::text AS received_date
       FROM item_stock_movements
      WHERE invoice_id = $1 AND reason = 'invoice_out' AND reversed_at IS NULL
      ORDER BY id
      FOR UPDATE`,
    [invoiceId]
  );
  if (outs.rows.length === 0) return;

  for (const m of outs.rows) {
    const back = -Number(m.delta); // delta 는 음수 → 되돌릴 수량
    if (back > 0) {
      let lotId: number | null = m.lot_id;
      if (lotId === null) {
        // 로트가 사라진 예외 상황 — 스냅샷 날짜로 같은 조건의 로트를 되살린다.
        const lot = await upsertLot(client, {
          itemId: Number(m.item_id),
          quantity: back,
          expiryDate: m.expiry_date,
          receivedDate: m.received_date,
          userId,
        });
        lotId = lot.id;
      } else {
        await client.query(
          `UPDATE item_lots SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
          [back, lotId]
        );
      }
      await insertMovement(client, {
        itemId: Number(m.item_id),
        lotId,
        delta: back,
        reason: "invoice_return",
        invoiceId,
        expiryDate: m.expiry_date,
        receivedDate: m.received_date,
        memo: "검수 재개로 원복",
        userId,
      });
    }
    await client.query(
      `UPDATE item_stock_movements SET reversed_at = NOW() WHERE id = $1`,
      [m.id]
    );
  }
}
