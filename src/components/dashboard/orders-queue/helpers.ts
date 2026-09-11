import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveOrderLifecycleStage } from '@/lib/order-lifecycle';
import { UNSHIPPED_STATE_META } from '@/lib/unshipped-state';
import { OUTBOUND_STATE_META } from '@/lib/outbound-state';
import {
  formatDateKeyMedium,
  formatDateKeyShort,
  toPSTDateKey,
} from '@/utils/date';
import type { QueueDisplaySort } from '@/utils/queue-display-sort';

export interface WeekRange {
  startStr: string;
  endStr: string;
}

/** A queue row plus the loosely-typed extra columns the various surfaces attach. */
export type QueueRowRecord = ShippedOrder & Record<string, unknown>;

/** Which surface owns this table — drives status dots and tracking affordances. */
export type OrdersQueueMode = 'fulfillment' | 'labels' | 'staged' | 'shipped';

/** Sort order for the date-banded / column-sorted queue.
 *  - `deadline` (default): bands by ship-by; most-overdue first within a day.
 *  - `newest`: bands by created date, most-recently-added first.
 *  - `priority`: retired synonym of `deadline` (tested-before-pending grouping
 *    on fulfillment). URL parse maps it to deadline.
 *  - Column sorts (`title`…`tracking`): flat global order (see queue-row-compare). */
export type OrdersQueueSort = QueueDisplaySort;

/** Treat empty / whitespace / legacy `'1'` sentinel as missing. */
function nonEmptyDateSource(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '1') return null;
  return raw;
}

/**
 * Instant used for day banding / within-day sort keys — matches
 * {@link useOrdersQueueRows}. `newest` prefers created; otherwise ship-by
 * (deadline → ship_by_date → created).
 */
export function queueRowBandDateSource(
  record: Pick<ShippedOrder, 'deadline_at' | 'created_at' | 'ship_by_date'>,
  sort: OrdersQueueSort,
): string | null {
  // Column sorts are flat (no day banding); if called, use ship-by.
  if (sort === 'newest') {
    return (
      nonEmptyDateSource(record.created_at) ||
      nonEmptyDateSource(record.deadline_at) ||
      nonEmptyDateSource(record.ship_by_date)
    );
  }
  return (
    nonEmptyDateSource(record.deadline_at) ||
    nonEmptyDateSource(record.ship_by_date) ||
    nonEmptyDateSource(record.created_at)
  );
}

/**
 * Absolute ship-by instant — deadline → ship_by_date → created. Used for
 * Late-column tooltips / mobile date meta / sort band keys. Independent of
 * display sort so the derived days-late face stays a stable urgency fact.
 */
export function queueRowShipBySource(
  record: Pick<ShippedOrder, 'deadline_at' | 'created_at' | 'ship_by_date'>,
): string | null {
  return queueRowBandDateSource(record, 'deadline');
}

/** Compact ship-by Date-column presentation (warehouse civil day). */
export function formatQueueRowDateCell(source: string | null | undefined): {
  key: string;
  label: string;
  tooltip: string;
} | null {
  if (!source) return null;
  const key = toPSTDateKey(source);
  if (!key || key === 'Unknown') return null;
  const when = formatDateKeyMedium(key, { weekday: 'short', withYear: true });
  return {
    key,
    label: formatDateKeyShort(key),
    tooltip: `Ship by · ${when}`,
  };
}

export interface RowStatusMeta {
  dot: string;
  label: string;
  description: string;
  /** Soft pill classes from the lifecycle meta registry (Status column chip). */
  pill: string;
}

/**
 * Format an order line's realized sale price (orders.sale_amount + currency)
 * for the row meta. Returns null when there's no amount so the slot stays
 * empty — most legacy orders have no price yet; only newly-ingested ones do.
 */
export function formatSalePrice(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (amount == null || amount === '') return null;
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/**
 * Guard a wire timestamp before display: empty/whitespace and the legacy `'1'`
 * sentinel are "missing" (plan §9.3). Returns the raw string otherwise —
 * formatting stays with `formatDateTimePST` (never parse dates here).
 */
export function nonSentinelTimestamp(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '1') return null;
  return raw;
}

/**
 * TESTED-lane "Tested at" raw value — prefer the serial MIN stamp
 * (`test_date_time`, shipped/packer feeds) then station activity
 * (`test_activity_at`, Pending's primary on `/api/orders`). Plan §9.3.
 */
export function queueRowTestedAtRaw(record: QueueRowRecord): string | null {
  return (
    nonSentinelTimestamp(record.test_date_time) ??
    nonSentinelTimestamp(record.test_activity_at)
  );
}

/**
 * Pack-lane stamp — same ladder the Pack cell paints (`packed_at`, then
 * `pack_activity_at`). Column sort reads this instant, not the packer name.
 */
export function queueRowPackedAtRaw(record: QueueRowRecord): string | null {
  return (
    nonSentinelTimestamp(record.packed_at) ??
    nonSentinelTimestamp(record.pack_activity_at)
  );
}

/**
 * TESTED-lane tester name from wire fields only — scan actor first
 * (`tested_by_name`), then assignee (`tester_name`). Staff-id fallback
 * (`getStaffName`) + `normalizePersonName` stay in the view layer (hooks).
 */
export function queueRowTesterNameRaw(record: QueueRowRecord): string | null {
  const scanActor = String(record.tested_by_name ?? '').trim();
  if (scanActor) return scanActor;
  const assignee = String(record.tester_name ?? '').trim();
  if (assignee) return assignee;
  return null;
}

/** Clean a tester/packer name, stripping role prefixes and placeholder values. */
export function normalizePersonName(value: unknown): string {
  const text = String(value ?? '')
    .replace(/^tech:\s*/i, '')
    .replace(/^packer:\s*/i, '')
    .trim();
  if (!text || /^(not specified|n\/a|null|undefined|staff\s*#\d+)$/i.test(text)) return '---';
  return text;
}

/**
 * Resolve the status dot/label/description for a row given the owning surface.
 *
 * `null` means **this queue has no per-row status to show**, and the row paints
 * no dot, no chip and no tooltip rather than a placeholder.
 *
 * That is the honest answer for the Labels queue. It is fed by
 * `awaitingLabelsQuery` — `awaitingOnly=true`, i.e. `shipment_id IS NULL` — so
 * every row in it is awaiting a label by construction. Stamping "Awaiting
 * Label" on each one spent a status track, a colour and a tooltip to restate
 * the table's own name, on a fixed-width stage where every track is contested.
 * A column that reads the same on every row is not a status; it is a title.
 *
 * (`staged` has the same shape — a constant `PACKED_STAGED` — and is left as-is
 * here on purpose: it was not part of this change and its surface has not been
 * measured for the desk stage yet.)
 */
export function resolveRowStatus(
  record: QueueRowRecord,
  queueMode: OrdersQueueMode,
): RowStatusMeta | null {
  if (queueMode === 'labels') return null;
  if (queueMode === 'staged') {
    const meta = OUTBOUND_STATE_META.PACKED_STAGED;
    return { dot: meta.dot, label: meta.label, description: meta.description, pill: meta.pill };
  }
  if (queueMode === 'shipped') {
    const outbound = String(record.outboundState || '').trim().toUpperCase();
    const meta =
      outbound && outbound in OUTBOUND_STATE_META
        ? OUTBOUND_STATE_META[outbound as keyof typeof OUTBOUND_STATE_META]
        : OUTBOUND_STATE_META.SCANNED_OUT;
    return { dot: meta.dot, label: meta.label, description: meta.description, pill: meta.pill };
  }
  // To-ship in-warehouse list: full pre-dock stage (incl. PACKED_STAGED), not
  // the three-lane fulfillment bucket that hid packed rows as "Tested".
  const stage = resolveOrderLifecycleStage({
    shipmentId: record.shipment_id,
    hasTechScan: Boolean(record.has_tech_scan),
    packedAt:
      nonSentinelTimestamp(record.packed_at) ??
      nonSentinelTimestamp((record as QueueRowRecord).pack_activity_at),
    isOutOfStock: Boolean(
      (record as QueueRowRecord).is_out_of_stock
        ?? (record as QueueRowRecord).isOutOfStock,
    ),
  });
  const meta = UNSHIPPED_STATE_META[stage];
  return { dot: meta.dot, label: meta.label, description: meta.description, pill: meta.pill };
}

/**
 * True when a row's latest carrier status indicates it has already moved into
 * the network (i.e. shipped) and should drop out of the queue. Rows with only a
 * created-label / unknown status remain visible.
 */
export function isShippedByLatestStatus(record: ShippedOrder): boolean {
  const category = String(record.latest_status_category ?? '').trim().toUpperCase();
  const label = String(record.latest_status_label ?? '').toUpperCase();
  const description = String(record.latest_status_description ?? '').toUpperCase();
  if (!category) {
    return label.includes('MOVING THROUGH NETWORK') || description.includes('MOVING THROUGH NETWORK');
  }
  return category !== 'LABEL_CREATED' && category !== 'UNKNOWN';
}
