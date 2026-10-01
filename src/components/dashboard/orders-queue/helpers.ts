import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveOutboundWorkflowFacts } from '@/lib/shipping/outbound-workflow-facts';
import type { OrderLifecycleStage } from '@/lib/order-lifecycle';
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

/** Sort order for the date-banded / column-sorted queue. */
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
 * Pack-lane stamp — same ladder the Pack cell paints (`packed_at`, then
 * `pack_activity_at`). Column sort reads this instant, not the packer name.
 */
export function queueRowPackedAtRaw(record: QueueRowRecord): string | null {
  return (
    nonSentinelTimestamp(record.packed_at) ??
    nonSentinelTimestamp(record.pack_activity_at)
  );
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

/** Resolve the status dot/label/description for a row given the owning surface. */
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
  const meta = UNSHIPPED_STATE_META[resolveRowWorkflowStage(record)];
  return { dot: meta.dot, label: meta.label, description: meta.description, pill: meta.pill };
}

/**
 * The row's pre-dock workflow stage — the one derivation the To-ship status
 * pill ({@link resolveRowStatus}) and the record's state code
 * (`orderLifecycleState`) both read, so the two can never disagree.
 */
export function resolveRowWorkflowStage(record: QueueRowRecord): OrderLifecycleStage {
  return resolveOutboundWorkflowFacts({
    shipmentId: record.shipment_id,
    fulfillmentChannel: record.fulfillment_channel,
    hasPickScan: Boolean(record.has_pick_scan),
    packedAt:
      nonSentinelTimestamp(record.packed_at) ??
      nonSentinelTimestamp((record as QueueRowRecord).pack_activity_at),
    dockStagedAt: nonSentinelTimestamp((record as QueueRowRecord).dock_staged_at),
    isOutOfStock: Boolean(
      (record as QueueRowRecord).is_out_of_stock
        ?? (record as QueueRowRecord).isOutOfStock,
    ),
    deadlineAt: queueRowShipBySource(record),
  }).stage;
}

/**
 * True when a row's latest carrier status indicates it has already moved into
 * the network (i.e. shipped) and should drop out of the queue. Rows with only a
 * created-label / unknown status remain visible.
 */
function isShippedByLatestStatus(record: ShippedOrder): boolean {
  const category = String(record.latest_status_category ?? '').trim().toUpperCase();
  const label = String(record.latest_status_label ?? '').toUpperCase();
  const description = String(record.latest_status_description ?? '').toUpperCase();
  if (!category) {
    return label.includes('MOVING THROUGH NETWORK') || description.includes('MOVING THROUGH NETWORK');
  }
  return category !== 'LABEL_CREATED' && category !== 'UNKNOWN';
}
