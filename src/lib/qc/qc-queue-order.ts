/**
 * The QC queue's order (owner 2026-09-29, `/m/qc`): every unit waiting for
 * quality control, most urgent first. Pure and browser-safe — the ONE place
 * the urgency tiers live; `listQcQueue` (`./queue.ts`) only reads the facts
 * each tier is decided from.
 *
 * Tiers, top to bottom, first match wins:
 *   1. Returns          — the carton or the line is a return
 *   2. Repair service   — the line is a customer repair
 *   3. Unfound          — the carton matched no PO
 *   4. Local pickup     — the carton came in as a local pickup
 *   5. Test again       — a TEST_AGAIN verdict, or the unit sits IN_TEST
 *   6. Quality control  — everything else
 * Inside a tier: a priority carton (a pending order waits on it) first, then
 * the oldest unbox, a carton never unboxed last, then unit id.
 */

export const QC_QUEUE_TIERS = ['return', 'repair', 'unfound', 'pickup', 'retest', 'qc'] as const;
export type QcQueueTier = (typeof QC_QUEUE_TIERS)[number];

/** Past this many whole days since unbox, the card's age reads in danger ink (owner default, 2026-09-29). */
export const QC_AGE_ALERT_DAYS = 2;

/** The facts a tier is decided from — raw, as the carton / line / unit carry them. */
export interface QcQueueTierFacts {
  cartonIsReturn: boolean;
  /** `receiving_carton.intake_type` (`RETURN`, `PO`, `REPAIR`, …). */
  cartonIntakeType: string | null;
  /** `receiving_carton.source` (`unmatched`, `local_pickup`, `zoho_po`, …). */
  cartonSource: string | null;
  /** `receiving_line.receiving_type` (`RETURN`, `PICKUP`, `PO`, …). */
  lineReceivingType: string | null;
  /** `receiving_line.intake_type` (`return`, `repair`, `po`). */
  lineIntakeType: string | null;
  lineIsRepairService: boolean;
  /** A `receiving_line_facts` row of kind `repair_service` exists for the line. */
  lineHasRepairFact: boolean;
  /** `receiving_unit_stage_facts.qc_state`. */
  qcState: string;
  /** `serial_units.current_status`. */
  unitStatus: string;
}

const upper = (value: string | null) => (value ?? '').trim().toUpperCase();

export function qcQueueTier(facts: QcQueueTierFacts): QcQueueTier {
  if (
    facts.cartonIsReturn ||
    upper(facts.cartonIntakeType) === 'RETURN' ||
    upper(facts.lineReceivingType) === 'RETURN' ||
    upper(facts.lineIntakeType) === 'RETURN'
  ) {
    return 'return';
  }
  if (facts.lineIsRepairService || facts.lineHasRepairFact || upper(facts.lineIntakeType) === 'REPAIR') return 'repair';
  if (facts.cartonSource === 'unmatched') return 'unfound';
  if (facts.cartonSource === 'local_pickup' || upper(facts.lineReceivingType) === 'PICKUP') return 'pickup';
  if (facts.qcState === 'TEST_AGAIN' || facts.unitStatus === 'IN_TEST') return 'retest';
  return 'qc';
}

/** What the queue sorts on. */
export interface QcQueueSortKey {
  tier: QcQueueTier;
  /** The carton is flagged `is_priority` — a pending order waits on it. */
  priority: boolean;
  /** When the carton was unboxed (ISO), null = never. */
  unboxedAt: string | null;
  serialUnitId: number;
}

const TIER_RANK: Readonly<Record<QcQueueTier, number>> = Object.fromEntries(
  QC_QUEUE_TIERS.map((tier, index) => [tier, index]),
) as Record<QcQueueTier, number>;

function unboxedMs(value: string | null): number {
  const ms = value == null ? Number.NaN : Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

export function compareQcQueue(a: QcQueueSortKey, b: QcQueueSortKey): number {
  return (
    TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
    Number(b.priority) - Number(a.priority) ||
    // Infinity − Infinity is NaN: two never-unboxed units tie here and fall to the id.
    (unboxedMs(a.unboxedAt) - unboxedMs(b.unboxedAt) || 0) ||
    a.serialUnitId - b.serialUnitId
  );
}

/** The queue in urgency order (a new array). */
export function orderQcQueue<T extends QcQueueSortKey>(rows: readonly T[]): T[] {
  return [...rows].sort(compareQcQueue);
}

/** Units per tier, every tier present (an empty tier is 0, never missing). */
export function qcQueueTierCounts(rows: readonly Pick<QcQueueSortKey, 'tier'>[]): Record<QcQueueTier, number> {
  const counts = Object.fromEntries(QC_QUEUE_TIERS.map((tier) => [tier, 0])) as Record<QcQueueTier, number>;
  for (const row of rows) counts[row.tier] += 1;
  return counts;
}

/** How long the unit has waited since unbox — the card's top-right. */
export interface QcQueueAge {
  /** `5H` under a day, `3D` after. `—` when the carton was never unboxed. */
  face: string;
  /** Past {@link QC_AGE_ALERT_DAYS}. */
  alert: boolean;
}

const HOUR_MS = 3_600_000;

export function qcQueueAge(unboxedAt: string | null, nowMs: number): QcQueueAge {
  const ms = unboxedMs(unboxedAt);
  if (!Number.isFinite(ms)) return { face: '—', alert: false };
  const hours = Math.max(0, Math.floor((nowMs - ms) / HOUR_MS));
  const days = Math.floor(hours / 24);
  return { face: days === 0 ? `${hours}H` : `${days}D`, alert: days > QC_AGE_ALERT_DAYS };
}

// ─── The wire ────────────────────────────────────────────────────────────────

/** One unit on the queue, as `GET /api/qc/queue` sends it. */
export interface QcQueueUnit extends QcQueueSortKey {
  receivingId: number | null;
  receivingLineId: number;
  /** The unit's own bin (`serial_units.current_location`). */
  bin: string | null;
  /** The carton's dock (staging) location — where the unit sits until it gets a bin. */
  dockLocation: string | null;
  serial: string | null;
  sku: string | null;
  /** SKU identity title (`resolveSkuIdentityTitle`); '' when nothing names the product. */
  title: string;
  photoUrl: string | null;
}

export interface QcQueuePayload {
  /** The first `units.length` of the queue, in urgency order. */
  units: QcQueueUnit[];
  /** Every actionable unit — `units` may be capped below it. */
  total: number;
  tierCounts: Record<QcQueueTier, number>;
  /** Units this tech passed or failed today (PST) — the progress bar's filled part. */
  doneToday: number;
}
