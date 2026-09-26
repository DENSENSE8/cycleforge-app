/** The three `/api/reports/*` wire rows — parsed ONCE at the `fetch` boundary, with the row type derived from the parser. */

import { z } from 'zod';

/** The velocity route's `CASE` output — a closed vocabulary, so the pill's. */
const VELOCITY_TIERS = ['A', 'B', 'C', 'D'] as const;

type VelocityTier = (typeof VELOCITY_TIERS)[number];

/** SQL NULL and a blank string are the same absence; both read as `null`. */
const wireText = z
  .union([z.string(), z.null()])
  .transform((value) => (value ?? '').trim() || null);

/** A `numeric`/`bigint` arrives as a string; a NULL column arrives as `null`. */
const wireNumber = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: 'custom', message: 'not a finite number' });
    return z.NEVER;
  }
  return parsed;
});

/** A timestamp crosses `NextResponse.json` as an ISO string. */
const wireInstant = z.union([z.string(), z.null()]).transform((value, ctx) => {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (Number.isNaN(new Date(text).getTime())) {
    ctx.addIssue({ code: 'custom', message: 'not a parseable instant' });
    return z.NEVER;
  }
  return text;
});

/** One `mv_bin_utilization` row, org-scoped by the route's `locations` join. */
const binUtilizationReportRowSchema = z.object({
  /** `locations.id` — the row's stable key, never a painted fact. */
  bin_id: wireNumber,
  bin_name: wireText,
  barcode: wireText,
  room: wireText,
  /** Null on a bin with no declared capacity — the retired cell printed `—`. */
  capacity: wireNumber.nullable(),
  in_bin: wireNumber,
  /** A RATIO (0…1+). The percentage face is DERIVED, never stored. */
  fill_ratio: wireNumber.nullable(),
  sku_count: wireNumber,
});

/** One 30-day SKU movement row, recomputed from the org-bearing base tables. */
const velocityReportRowSchema = z.object({
  sku: z.string().trim().min(1),
  product_title: wireText,
  /** `LEFT JOIN sku_stock` — null when the SKU carries no stock row. */
  current_stock: wireNumber.nullable(),
  out_qty: wireNumber,
  in_qty: wireNumber,
  /** Last non-`INITIAL_BALANCE` ledger write inside the 30-day window. */
  last_move_at: wireInstant,
  velocity_tier: z.enum(VELOCITY_TIERS),
});

/** One dormant-stock row (90d+), recomputed from the org-bearing base tables. */
const deadStockReportRowSchema = z.object({
  sku: z.string().trim().min(1),
  product_title: wireText,
  stock: wireNumber,
  last_move_at: wireInstant,
  /** Null ⇔ never moved. The route models that case (`includeNeverMoved`). */
  days_dormant: wireNumber.nullable(),
});

export type BinUtilizationReportRow = z.infer<typeof binUtilizationReportRowSchema>;
export type VelocityReportRow = z.infer<typeof velocityReportRowSchema>;
export type DeadStockReportRow = z.infer<typeof deadStockReportRowSchema>;

/** The FAILURE half of the `{ success, error }` envelope all three report routes return — the route's own message, or `null` when the… */
export function reportRouteFailure(payload: unknown): string | null {
  const parsed = z
    .object({ success: z.literal(false), error: z.string().optional() })
    .safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.error ?? 'The report route reported a failure';
}

/** Parse one report response. */
function parseReportRows<Schema extends z.ZodType>(
  payload: unknown,
  report: string,
  rowSchema: Schema,
): z.output<Schema>[] {
  const result = z.object({ rows: z.array(rowSchema) }).safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    const at = issue?.path.join('.') ?? 'rows';
    throw new Error(
      `/api/reports/${report}: ${at} — ${issue?.message ?? 'unreadable response'}`,
    );
  }
  return result.data.rows;
}

export function parseBinUtilizationReportRows(payload: unknown): BinUtilizationReportRow[] {
  return parseReportRows(payload, 'bin-utilization', binUtilizationReportRowSchema);
}

export function parseVelocityReportRows(payload: unknown): VelocityReportRow[] {
  return parseReportRows(payload, 'velocity', velocityReportRowSchema);
}

export function parseDeadStockReportRows(payload: unknown): DeadStockReportRow[] {
  return parseReportRows(payload, 'dead-stock', deadStockReportRowSchema);
}
