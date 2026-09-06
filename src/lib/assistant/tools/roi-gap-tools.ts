/**
 * get_roi_gaps — where the operation is leaking, ranked, from live rows.
 *
 * The home board's headline tile and the answer to "what should we fix first".
 *
 * ## Deterministic on purpose
 *
 * Every gap here is a COUNT over real tables with a named query. Nothing is
 * inferred, scored by a model, or weighted by a guessed dollar value: this app
 * has no reliable per-unit price, so ranking by fabricated revenue would be a
 * horoscope with a currency symbol. Gaps rank by `units` (how much physical
 * inventory or how many orders are actually stuck) and carry `oldestDays` so
 * an operator can tell a big-and-fresh pile from a small-and-rotting one.
 *
 * ## One implementation, two faces
 *
 * The board tile and the agent call THIS tool. That is the parity rule from
 * `docs/todo/design-system-ideas-LOOP.md`: a glanceable tile and a
 * conversational answer must never drift, so they cannot have two queries.
 * Each gap ships a `question` — the sentence the operator's click seeds into
 * the composer, which is how a number on a tile becomes work.
 *
 * ## Scoping
 *
 * Every statement leads with an explicit `organization_id = $1` on top of the
 * tenant-pool GUC, per the registry law. The org comes from ctx, never input.
 */

import { z } from 'zod';
import type { AssistantToolDef, AssistantToolDeps } from './types';

/** Dormant for this long counts as dead stock, matching the /reports desk. */
const DEAD_STOCK_DAYS = 90;

export interface RoiGap {
  /** Stable id — the board uses it as a React key and a click target. */
  id: string;
  label: string;
  /** How many units / orders / SKUs are stuck. The ranking key. */
  units: number;
  /** What `units` counts, so a tile never renders a bare number. */
  unit: 'units' | 'orders' | 'skus';
  /** Age of the oldest stuck item, or null when the table carries no date. */
  oldestDays: number | null;
  /** Why it costs money, in one operator sentence. */
  why: string;
  /** The question this tile seeds into the composer on click. */
  question: string;
}

interface GapQuery {
  id: string;
  label: string;
  unit: RoiGap['unit'];
  why: string;
  question: string;
  sql: string;
}

/**
 * Each query returns exactly `units` and `oldest_days`. Column names are
 * verified against the live schema: `serial_units.current_status` (not
 * `status`), `orders_exceptions.status = 'open'` lowercase,
 * `receiving_exceptions.status = 'OPEN'` uppercase — the two exception tables
 * genuinely disagree on case, so neither predicate may be "tidied".
 */
const GAP_QUERIES: readonly GapQuery[] = [
  {
    id: 'unlisted_units',
    label: 'Received but never listed',
    unit: 'units',
    why: 'Inventory that arrived, got put away, and never reached a channel earns nothing while it ages.',
    question: 'Show me the units that were received but never listed, oldest first',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - su.received_at))::int AS oldest_days
        FROM serial_units su
       WHERE su.organization_id = $1
         AND su.current_status IN ('RECEIVED', 'LABELED', 'UNKNOWN')
         AND NOT EXISTS (
               SELECT 1 FROM serial_unit_listings l
                WHERE l.serial_unit_id = su.id
                  AND l.organization_id = su.organization_id)`,
  },
  {
    id: 'dead_stock',
    label: `Dead stock (${DEAD_STOCK_DAYS}+ days dormant)`,
    unit: 'skus',
    why: 'Stock nothing has moved in a quarter is carrying cost with no demand signal behind it.',
    question: `Show me dead stock dormant for more than ${DEAD_STOCK_DAYS} days`,
    sql: `
      SELECT count(*)::int AS units,
             max(days_dormant)::int AS oldest_days
        FROM mv_dead_stock
       WHERE organization_id = $1
         AND days_dormant >= ${DEAD_STOCK_DAYS}`,
  },
  {
    id: 'open_order_exceptions',
    label: 'Open order exceptions',
    unit: 'orders',
    why: 'Every open exception is an order a customer is waiting on that no station is working.',
    question: 'Show me the open order exceptions, oldest first',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - created_at))::int AS oldest_days
        FROM orders_exceptions
       WHERE organization_id = $1
         AND status = 'open'`,
  },
  {
    id: 'open_receiving_exceptions',
    label: 'Open receiving exceptions',
    unit: 'units',
    why: 'A carton stuck in receiving exception never becomes sellable inventory.',
    question: 'Show me the open receiving exceptions',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - created_at))::int AS oldest_days
        FROM receiving_exceptions
       WHERE organization_id = $1
         AND status = 'OPEN'`,
  },
  {
    id: 'units_on_hold',
    label: 'Units on hold',
    unit: 'units',
    why: 'A hold with no disposition is a decision nobody has made yet.',
    question: 'Show me the units on hold and why',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - su.updated_at))::int AS oldest_days
        FROM serial_units su
       WHERE su.organization_id = $1
         AND su.current_status = 'ON_HOLD'`,
  },
  {
    id: 'repairs_in_flight',
    label: 'Repairs started, not finished',
    unit: 'units',
    why: 'Labour and parts are already sunk into these; unfinished means the spend has not converted.',
    question: 'Show me repairs that were started but never completed',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - started_at))::int AS oldest_days
        FROM unit_repairs
       WHERE organization_id = $1
         AND completed_at IS NULL`,
  },
];

const roiGapsInput = z.object({
  /** Gaps with zero stuck items are dropped, so `limit` is a display cap. */
  limit: z.number().int().min(1).max(10).default(6),
});

export const getRoiGaps: AssistantToolDef<typeof roiGapsInput> = {
  name: 'get_roi_gaps',
  description:
    'Where the operation is leaking, ranked by how much is stuck: units received but never listed, dead stock, open order and receiving exceptions, units on hold, and unfinished repairs. Each gap returns { id, label, units, unit, oldestDays, why, question } — `question` is the follow-up that pulls the actual rows. Use for "what should we fix first", "where are we losing money", "what are our biggest gaps". Counts are live row counts, never estimates: report them exactly and never attach a dollar figure, because this tool does not compute one.',
  permission: 'operations.view',
  inputSchema: roiGapsInput,
  run: async (input, ctx, deps: AssistantToolDeps) => {
    const gaps: RoiGap[] = [];
    for (const gap of GAP_QUERIES) {
      const { rows } = await deps.query(ctx.organizationId, gap.sql, [ctx.organizationId]);
      const row = rows[0] ?? {};
      const units = Number(row.units ?? 0);
      // A gap with nothing in it is not a gap. Rendering "0 units stuck" six
      // times teaches an operator to stop reading the tile.
      if (!Number.isFinite(units) || units <= 0) continue;
      const oldest = row.oldest_days;
      gaps.push({
        id: gap.id,
        label: gap.label,
        units,
        unit: gap.unit,
        oldestDays: oldest == null ? null : Number(oldest),
        why: gap.why,
        question: gap.question,
      });
    }
    gaps.sort((a, b) => b.units - a.units);
    return { gaps: gaps.slice(0, input.limit), checkedAt: new Date().toISOString() };
  },
};
