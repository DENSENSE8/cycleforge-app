/**
 * "What is the most expensive order currently in the warehouse?" — order value,
 * ranked, over the orders we are still physically holding.
 *
 * ## Grain: `orders` is a LINE table
 *
 * One `orders` row is one line item. An ORDER is the group of rows sharing
 * `orders.order_id`, so its value is `SUM(orders.sale_amount)` over that group.
 * Ranking a single row would answer "most expensive LINE", which is a different
 * and much less useful question — a $4,000 order of eight $500 lines would lose
 * to a $900 single-line order.
 *
 * `sale_amount` is `numeric(12,2)`, which node-pg hands back as a STRING. It is
 * never parsed into a display path: every printed figure goes through
 * `money()`, and the only arithmetic on it is the totals row.
 *
 * ## "Currently in the warehouse" — four clauses, all required
 *
 *   1. no dock scan-out: no `station_activity_logs` SHIP_CONFIRM on the shipment
 *   2. not in carrier custody: `shipping_tracking_numbers` shows no acceptance,
 *      transit, out-for-delivery or delivery, and no status category beyond
 *      LABEL_CREATED / UNKNOWN
 *   3. not Amazon-fulfilled (`fulfillment_channel <> 'AFN'`) — Amazon ships those
 *   4. not caged without a catalog SKU — a gated row that is not real stock yet
 *
 * Clauses 1–2 reuse the shared order-grain fragments so this report and the
 * outbound desks cannot drift about what "left the building" means.
 *
 * ## What this report is NOT
 *
 * There is no cost, fee or margin column anywhere on `orders`. Every dollar
 * here is SALE value. The report says so, on the report, because an owner
 * looking at "most expensive" will otherwise read it as "most profitable".
 */

import { z } from 'zod';
import {
  count,
  days,
  emptyReport,
  money,
  operatorStamp,
  reportEnvelope,
  statusBelow,
  OPERATOR_TZ,
} from '@/lib/reports/report-kit';
import {
  sqlOrderHasPackScan,
  sqlOrderHasShipConfirm,
  sqlOrderHasTechScan,
} from '@/lib/orders/order-grain-sql';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportSection,
  ArtifactReportStandard,
} from '@/lib/assistant/ui-artifacts';
import type { AssistantToolCtx, AssistantToolDeps } from '@/lib/assistant/tools/types';

const TITLE = 'Order value in the building';
const QUESTION = 'What is the most expensive order currently in the warehouse?';

/** Lines printed for the top order before the section becomes a dump. */
const LINE_LIMIT = 200;

/**
 * Stage ranks, least advanced first. An order ships as a whole, so the order's
 * stage is its LEAST advanced line: one unlabeled or out-of-stock line holds
 * the whole order, and calling that order "packed" would hide the blocker.
 */
const STAGE_BY_RANK: readonly string[] = [
  'AWAITING_LABEL',
  'BLOCKED',
  'PENDING',
  'PICKED',
  'PACKED',
];

const NOTES: readonly string[] = [
  'Order value is SUM(orders.sale_amount) over every row sharing the same orders.order_id — `orders` is a line table, so one row is one line, not one order.',
  'This is SALE price, not profit. There is no cost, fee or margin column on orders, so no margin, no landed cost and no net figure is computed or implied anywhere on this report.',
  'Amazon-fulfilled orders (fulfillment_channel = AFN) are excluded: Amazon picks, packs and ships those, so they are not sitting in this warehouse.',
  'Ship-by is not a column on orders. It is work_assignments.deadline_at for the ORDER/TEST assignment on the order row — the earliest such deadline when the order has several lines.',
  "An order's stage is its LEAST advanced line (AWAITING_LABEL → BLOCKED → PENDING → PICKED → PACKED), because one unlabeled or out-of-stock line holds the whole order.",
];

function warehouseStandards(): ArtifactReportStandard[] {
  return [
    {
      label: 'Not scanned out',
      value: 'no SHIP_CONFIRM',
      unit: null,
      note: "The order's shipment has no station_activity_logs row with activity_type = 'SHIP_CONFIRM' — nobody scanned it out at the dock.",
    },
    {
      label: 'Not in carrier custody',
      value: 'LABEL_CREATED / UNKNOWN',
      unit: null,
      note: 'shipping_tracking_numbers shows no acceptance, transit, out-for-delivery or delivery, and no latest_status_category beyond LABEL_CREATED or UNKNOWN.',
    },
    {
      label: 'Not Amazon-fulfilled',
      value: "fulfillment_channel <> 'AFN'",
      unit: null,
      note: 'AFN/FBA orders are shipped by Amazon, so they are never physically here.',
    },
    {
      label: 'Not caged without a SKU',
      value: "release_state <> 'caged'",
      unit: null,
      note: 'A caged row with no sku_catalog_id is a gated placeholder, not stock standing on the floor.',
    },
  ];
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

/**
 * Every order LINE we are still holding, one row per line, with its stage rank,
 * its age and its TEST deadline. `organization_id = $1` leads the predicate
 * list and is repeated on every join.
 */
const IN_BUILDING_CTE = `in_building AS (
    SELECT
      o.id                                                AS row_id,
      o.order_id                                          AS order_id,
      COALESCE(NULLIF(o.order_id, ''), '#' || o.id::text) AS order_key,
      o.sale_amount                                       AS sale_amount,
      COALESCE(o.currency, 'USD')                         AS currency,
      o.account_source                                    AS channel,
      o.sku                                               AS sku,
      o.product_title                                     AS product_title,
      o.quantity                                          AS quantity,
      o.buyer_note                                        AS buyer_note,
      stn.tracking_number_raw                             AS tracking,
      stn.carrier                                         AS carrier,
      ship_by.deadline_at                                 AS deadline_at,
      EXTRACT(DAY FROM (NOW() - COALESCE(o.order_date, o.created_at)))::int AS age_days,
      CASE
        WHEN o.shipment_id IS NULL          THEN 0
        WHEN o.is_out_of_stock IS TRUE      THEN 1
        WHEN ${sqlOrderHasPackScan('o')}    THEN 4
        WHEN ${sqlOrderHasTechScan('o')}    THEN 3
        ELSE 2
      END                                                 AS stage_rank
    FROM orders o
    LEFT JOIN shipping_tracking_numbers stn
      ON stn.id = o.shipment_id AND stn.organization_id = o.organization_id
    LEFT JOIN LATERAL (
      SELECT wa.deadline_at
      FROM work_assignments wa
      WHERE wa.organization_id = o.organization_id
        AND wa.entity_type = 'ORDER'
        AND wa.work_type = 'TEST'
        AND wa.entity_id = o.id
      ORDER BY wa.deadline_at ASC NULLS LAST, wa.id ASC
      LIMIT 1
    ) ship_by ON TRUE
    WHERE o.organization_id = $1
      AND NOT ${sqlOrderHasShipConfirm('o')}
      AND NOT (
        COALESCE(stn.is_carrier_accepted, false)
        OR COALESCE(stn.is_in_transit, false)
        OR COALESCE(stn.is_out_for_delivery, false)
        OR COALESCE(stn.is_delivered, false)
        OR COALESCE(stn.latest_status_category, 'UNKNOWN') NOT IN ('LABEL_CREATED', 'UNKNOWN')
      )
      AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
      AND NOT (COALESCE(o.release_state, '') = 'caged' AND o.sku_catalog_id IS NULL)
  )`;

/** Line rows collapsed to orders, then labelled with the stage word. */
const STAGED_CTE = `per_order AS (
    SELECT
      ib.order_key                                            AS order_key,
      (ARRAY_AGG(ib.order_id ORDER BY ib.row_id))[1]           AS order_id,
      SUM(ib.sale_amount)                                      AS value,
      COUNT(*)                                                 AS lines_ct,
      MIN(ib.stage_rank)                                       AS stage_rank,
      MAX(ib.age_days)                                         AS age_days,
      MIN(ib.deadline_at)                                      AS deadline_at,
      (ARRAY_AGG(ib.currency ORDER BY ib.row_id))[1]           AS currency,
      (ARRAY_AGG(ib.channel ORDER BY ib.row_id))[1]            AS channel,
      (ARRAY_AGG(ib.tracking ORDER BY ib.row_id))[1]           AS tracking,
      (ARRAY_AGG(ib.carrier ORDER BY ib.row_id))[1]            AS carrier
    FROM in_building ib
    GROUP BY ib.order_key
  ),
  staged AS (
    SELECT
      po.*,
      CASE po.stage_rank
        WHEN 0 THEN 'AWAITING_LABEL'
        WHEN 1 THEN 'BLOCKED'
        WHEN 2 THEN 'PENDING'
        WHEN 3 THEN 'PICKED'
        ELSE 'PACKED'
      END AS stage
    FROM per_order po
  )`;

const STAGE_SQL = `WITH ${IN_BUILDING_CTE},
  ${STAGED_CTE}
  SELECT
    s.stage                                                    AS stage,
    MIN(s.stage_rank)                                          AS stage_rank,
    COUNT(*)                                                   AS orders_ct,
    COALESCE(SUM(s.value), 0)                                  AS value,
    MAX(s.age_days)                                            AS oldest_days,
    COALESCE(SUM(
      CASE WHEN s.deadline_at IS NOT NULL AND s.deadline_at < NOW()
           THEN s.value ELSE 0 END
    ), 0)                                                      AS at_risk_value,
    COUNT(s.deadline_at)                                       AS with_deadline,
    STRING_AGG(DISTINCT s.currency, ',')                       AS currencies
  FROM staged s
  WHERE ($2::text IS NULL OR s.stage = $2::text)
  GROUP BY s.stage
  ORDER BY MIN(s.stage_rank) ASC`;

const TOP_SQL = `WITH ${IN_BUILDING_CTE},
  ${STAGED_CTE}
  SELECT
    s.order_key   AS order_key,
    s.order_id    AS order_id,
    s.value       AS value,
    s.lines_ct    AS lines_ct,
    s.stage       AS stage,
    s.age_days    AS age_days,
    s.deadline_at AS deadline_at,
    s.currency    AS currency,
    s.channel     AS channel,
    s.tracking    AS tracking,
    s.carrier     AS carrier
  FROM staged s
  WHERE ($2::text IS NULL OR s.stage = $2::text)
  ORDER BY s.value DESC NULLS LAST, s.order_key ASC
  LIMIT $3`;

const TOP_LINES_SQL = `WITH ${IN_BUILDING_CTE}
  SELECT
    ib.sku           AS sku,
    ib.product_title AS product_title,
    ib.quantity      AS quantity,
    ib.sale_amount   AS sale_amount,
    ib.currency      AS currency
  FROM in_building ib
  WHERE ib.order_key = $2::text
  ORDER BY ib.sale_amount DESC NULLS LAST, ib.row_id ASC
  LIMIT ${LINE_LIMIT}`;

// ─── Row coercion ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** node-pg hands back `bigint`/`numeric` as strings. One door for all of them. */
function int(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Money as a number, for totals only. Every PRINTED figure goes through money(). */
function amount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v : String(v);
  return s.length > 0 ? s : null;
}

function toDate(v: unknown): Date | null {
  const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function ptDate(v: unknown): string {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATOR_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

interface StageRow {
  stage: string;
  orders: number;
  value: number;
  oldestDays: number;
  atRiskValue: number;
  withDeadline: number;
  currencies: string[];
}

function readStageRow(row: Row): StageRow {
  const rank = int(row.stage_rank);
  return {
    stage: text(row.stage) ?? STAGE_BY_RANK[rank] ?? 'PENDING',
    orders: int(row.orders_ct),
    value: amount(row.value),
    oldestDays: int(row.oldest_days),
    atRiskValue: amount(row.at_risk_value),
    withDeadline: int(row.with_deadline),
    currencies: (text(row.currencies) ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
  };
}

// ─── Sections ────────────────────────────────────────────────────────────────

function shipByCell(value: unknown, now: Date): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.getTime() < now.getTime() ? `${ptDate(d)} · past due` : ptDate(d);
}

function topSection(rows: readonly Row[], now: Date): ArtifactReportSection {
  return {
    title: 'Top orders by value',
    note: 'Ranked by SUM(sale_amount) over the lines of each order_id. Sale price, not margin.',
    columns: [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'order', label: 'Order' },
      { key: 'value', label: 'Value', align: 'right' },
      { key: 'lines', label: 'Lines', align: 'right' },
      { key: 'stage', label: 'Stage' },
      { key: 'age', label: 'Age', align: 'right' },
      { key: 'ship_by', label: 'Ship by' },
      { key: 'channel', label: 'Channel' },
      { key: 'tracking', label: 'Tracking' },
    ],
    rows: rows.map((r, i) => ({
      rank: i + 1,
      order: text(r.order_id) ?? text(r.order_key) ?? '—',
      value: money(text(r.value), text(r.currency) ?? 'USD'),
      lines: count(int(r.lines_ct)),
      stage: text(r.stage) ?? '—',
      age: days(int(r.age_days)),
      ship_by: shipByCell(r.deadline_at, now),
      channel: text(r.channel) ?? '—',
      tracking: text(r.tracking) ?? '—',
    })),
  };
}

function topLinesSection(rows: readonly Row[], orderLabel: string): ArtifactReportSection {
  return {
    title: 'Lines in the top order',
    note: `Every line still in the building on order ${orderLabel}.`,
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'value', label: 'Value', align: 'right' },
    ],
    rows: rows.map((r) => ({
      sku: text(r.sku) ?? '—',
      product: (text(r.product_title) ?? '—').slice(0, 60),
      qty: text(r.quantity) ?? '—',
      value: money(text(r.sale_amount), text(r.currency) ?? 'USD'),
    })),
  };
}

function stageSection(stages: readonly StageRow[], currency: string): ArtifactReportSection {
  return {
    title: 'Value by stage',
    note: "An order's stage is its least advanced line — one held line holds the order.",
    columns: [
      { key: 'stage', label: 'Stage' },
      { key: 'orders', label: 'Orders', align: 'right' },
      { key: 'value', label: 'Value', align: 'right' },
      { key: 'oldest_days', label: 'Oldest', align: 'right' },
    ],
    rows: stages.map((s) => ({
      stage: s.stage,
      orders: count(s.orders),
      value: money(s.value, currency),
      oldest_days: days(s.oldestDays),
    })),
    totals: {
      stage: 'Total',
      orders: count(stages.reduce((sum, s) => sum + s.orders, 0)),
      value: money(
        stages.reduce((sum, s) => sum + s.value, 0),
        currency,
      ),
      oldest_days: days(stages.reduce((max, s) => Math.max(max, s.oldestDays), 0)),
    },
  };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export interface OrderValueRankArgs {
  /** Display cap on the ranked table. */
  limit?: number;
  /** One of AWAITING_LABEL | BLOCKED | PENDING | PICKED | PACKED. */
  stage?: string;
}

export async function buildOrderValueRankReport(
  args: OrderValueRankArgs,
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
  now: Date = new Date(),
): Promise<ToolArtifactEnvelope> {
  const limit = Math.min(25, Math.max(1, Math.trunc(args.limit ?? 10)));
  const stage = args.stage ?? null;
  const scope = stage
    ? `Orders still in the building · stage ${stage} · top ${limit}`
    : `Orders still in the building · top ${limit}`;

  const [stageResult, topResult] = await Promise.all([
    deps.query(ctx.organizationId, STAGE_SQL, [ctx.organizationId, stage]),
    deps.query(ctx.organizationId, TOP_SQL, [ctx.organizationId, stage, limit]),
  ]);

  const stages = stageResult.rows.map(readStageRow);
  const topRows = topResult.rows;
  const top = topRows[0];

  if (!top) {
    const base = emptyReport({
      title: TITLE,
      question: QUESTION,
      now,
      scope,
      label: 'Most expensive order in the building',
      note: NOTES[0],
      standards: warehouseStandards(),
    });
    const report: ArtifactReport = {
      ...base,
      headline: {
        ...base.headline,
        unit: null,
        hint: 'No order matched all four "still in the building" clauses.',
      },
      notes: [...NOTES],
      followUps: [
        {
          label: 'Past ship-by',
          question: 'Which orders in the warehouse are past their ship-by date?',
        },
      ],
    };
    return reportEnvelope(
      report,
      'No orders are currently in the building: everything is either scanned out at the dock, in carrier custody, Amazon-fulfilled, or caged without a catalog SKU.',
    );
  }

  const topKey = text(top.order_key) ?? '';
  const topLabel = text(top.order_id) ?? (topKey || '—');
  const topCurrency = text(top.currency) ?? 'USD';
  const topStage = text(top.stage) ?? '—';
  const topAge = int(top.age_days);

  const linesResult = await deps.query(ctx.organizationId, TOP_LINES_SQL, [
    ctx.organizationId,
    topKey,
  ]);

  const ordersInBuilding = stages.reduce((sum, s) => sum + s.orders, 0);
  const valueInBuilding = stages.reduce((sum, s) => sum + s.value, 0);
  const atRiskValue = stages.reduce((sum, s) => sum + s.atRiskValue, 0);
  const withDeadline = stages.reduce((sum, s) => sum + s.withDeadline, 0);
  const currencies = [...new Set(stages.flatMap((s) => s.currencies))].sort();
  const totalsCurrency = currencies.length === 1 ? currencies[0] : 'USD';

  const notes = [...NOTES];
  if (currencies.length > 1) {
    notes.push(
      `More than one currency is in play (${currencies.join(', ')}). Per-order values are shown in the order's own currency; the totals row adds the raw amounts together and is therefore a mixed-currency figure, not a converted one.`,
    );
  }
  if (withDeadline === 0) {
    notes.push(
      'No order in the building carries an ORDER/TEST work-assignment deadline, so there is no ship-by to be past and the at-risk figure is neutral rather than good.',
    );
  }

  const kpis: ArtifactReportKpi[] = [
    {
      id: 'top_order_value',
      label: 'Top order value',
      value: money(text(top.value), topCurrency),
      unit: topCurrency,
      status: 'neutral',
      definition:
        'SUM(orders.sale_amount) over every line sharing this orders.order_id, among orders still in the building. Sale price, not margin.',
    },
    {
      id: 'top_order_age',
      label: 'Top order age',
      value: days(topAge),
      unit: 'days',
      status: statusBelow(topAge, 2, 5),
      definition:
        'Whole days between now and COALESCE(orders.order_date, orders.created_at) on the top order, taking the oldest of its lines. Good ≤ 2 days, watch ≤ 5.',
    },
    {
      id: 'top_order_stage',
      label: 'Top order stage',
      value: topStage,
      unit: null,
      status: 'neutral',
      definition:
        'The least advanced line on the top order: AWAITING_LABEL (no shipment), BLOCKED (out of stock), PENDING, PICKED (tech scan or serial) or PACKED (pack scan).',
    },
    {
      id: 'orders_in_building',
      label: 'Orders in building',
      value: count(ordersInBuilding),
      unit: 'orders',
      status: 'neutral',
      definition:
        'Distinct orders.order_id groups passing all four "still here" clauses: no SHIP_CONFIRM, no carrier custody, not AFN, not caged without a catalog SKU.',
    },
    {
      id: 'value_in_building',
      label: 'Value in building',
      value: money(valueInBuilding, totalsCurrency),
      unit: totalsCurrency,
      status: 'neutral',
      definition:
        'SUM(orders.sale_amount) across every line of every order still in the building. This is SALE value at risk of sitting, not margin — no cost or fee column exists.',
    },
    {
      id: 'at_risk_value',
      label: 'Past ship-by value',
      value: money(atRiskValue, totalsCurrency),
      unit: totalsCurrency,
      status: withDeadline === 0 ? 'neutral' : statusBelow(atRiskValue, 0, 0),
      definition:
        withDeadline === 0
          ? 'No order in the building has an ORDER/TEST work-assignment deadline, so nothing can be past ship-by. Neutral, not good: the deadline data is simply absent.'
          : 'Sale value of orders whose earliest ORDER/TEST work_assignments.deadline_at is already in the past. Any dollar past due reads bad.',
    },
  ];

  const report: ArtifactReport = {
    kind: 'report',
    title: TITLE,
    question: QUESTION,
    asOf: operatorStamp(now),
    scope,
    headline: {
      value: money(text(top.value), topCurrency),
      unit: null,
      label: 'Most expensive order in the building',
      hint: `${topLabel} · ${topStage} · ${days(topAge)} old`,
    },
    kpis,
    sections: [
      topSection(topRows, now),
      topLinesSection(linesResult.rows, topLabel),
      stageSection(stages, totalsCurrency),
    ],
    standards: warehouseStandards(),
    notes,
    followUps: [
      {
        label: 'Top order journey',
        question: `Show me the full history of order ${topLabel}`,
      },
      {
        label: 'Past ship-by',
        question: 'Which orders in the warehouse are past their ship-by date?',
      },
    ],
  };

  return reportEnvelope(
    report,
    `The most expensive order still in the building is ${topLabel} at ${money(text(top.value), topCurrency)} (${topStage}, ${days(topAge)} old). ${count(ordersInBuilding)} orders worth ${money(valueInBuilding, totalsCurrency)} of sale value are being held; ${money(atRiskValue, totalsCurrency)} of that is past its ship-by. Sale price, not margin.`,
  );
}

// ─── Tool input ──────────────────────────────────────────────────────────────

export const orderValueRankInput = z.object({
  limit: z.number().int().min(1).max(25).default(10),
  stage: z.string().max(40).optional(),
});

export type OrderValueRankInput = z.infer<typeof orderValueRankInput>;
