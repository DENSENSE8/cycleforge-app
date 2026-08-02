import type { TimelineItem, TimelineTone } from './types';
import { diffChanges } from './audit-diff';

/** One audit_logs row for an order, as returned by /api/orders/[id]/timeline. */
export interface OrderAuditRow {
  id: number;
  created_at: string | null;
  action: string;
  /**
   * Prior snapshot for the field-level diff. Optional: only the operations
   * journey selects it (and only exposes it to `admin.view_logs`, redacting it
   * to null otherwise). The order-details timeline omits it ⇒ no diff, exactly
   * as before.
   */
  before_data?: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  actor_name: string | null;
  /** `audit_logs.actor_staff_id` — resolves the actor's avatar. */
  actor_staff_id?: number | null;
}

const ACTION_MAP: Record<string, { title: string; tone: TimelineTone }> = {
  'orders.tracking.added': { title: 'Tracking added', tone: 'info' },
  'orders.label.printed': { title: 'Label printed', tone: 'success' },
  PACK_COMPLETED: { title: 'Packed', tone: 'success' },
  'shipment.scan_out': { title: 'Shipped — scanned out', tone: 'success' },
  'orders.update': { title: 'Order edited', tone: 'muted' },
  ORDER_ASSIGNMENT_UPDATED: { title: 'Order updated', tone: 'muted' },
  'orders.delete': { title: 'Order deleted', tone: 'danger' },
};

// Keys whose ORDER_ASSIGNMENT_UPDATED row is fully covered by the dedicated
// `orders.tracking.added` event — drop those to avoid a redundant double row.
const TRACKING_ONLY_KEYS = new Set([
  'shippingTrackingNumber',
  'trackingLinkCreates',
  'trackingLinkEdits',
  'trackingLinkDeletes',
]);

function pretty(action: string): string {
  const s = action.replace(/[._-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function prettyFieldKey(key: string): string {
  switch (key) {
    case 'isOutOfStock': return 'Out of stock';
    case 'isUrgent': return 'Urgent';
    default: return key;
  }
}

/**
 * Map order audit rows → timeline items for the {@link EventTimeline} in the
 * order details panel. Curates titles/tones for the governing events
 * (tracking added, label printed, packed, shipped) and drops the redundant
 * assignment row that only carried a tracking change.
 */
export function orderAuditToTimeline(rows: OrderAuditRow[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of rows) {
    const changedKeys = Array.isArray(r.metadata?.changedFieldKeys)
      ? (r.metadata!.changedFieldKeys as string[])
      : [];

    if (
      r.action === 'ORDER_ASSIGNMENT_UPDATED' &&
      changedKeys.length > 0 &&
      changedKeys.every((k) => TRACKING_ONLY_KEYS.has(k))
    ) {
      continue; // covered by orders.tracking.added
    }

    const mapped = ACTION_MAP[r.action];
    let title = mapped?.title ?? pretty(r.action);
    let tone: TimelineTone = mapped?.tone ?? 'muted';

    let subtitle: string | undefined;
    let ref: TimelineItem['ref'];
    if (r.action === 'orders.tracking.added') {
      const t = String((r.after_data?.trackingNumber as string | undefined) ?? '').trim();
      if (t) ref = { value: t, kind: 'tracking' }; // last-8 CopyChip, copy-on-click
    } else if (r.action === 'ORDER_ASSIGNMENT_UPDATED' && changedKeys.length > 0) {
      if (
        changedKeys.length === 1 &&
        changedKeys[0] === 'isOutOfStock' &&
        typeof r.after_data?.isOutOfStock === 'boolean'
      ) {
        title = r.after_data.isOutOfStock ? 'Marked out of stock' : 'Cleared out of stock';
        tone = r.after_data.isOutOfStock ? 'danger' : 'muted';
      } else {
        subtitle = changedKeys.map(prettyFieldKey).join(', ');
      }
    }

    // Field-level before→after diff (edit-style rows only). `diffChanges`
    // returns [] unless BOTH snapshots are present — so a redacted (non-admin)
    // or one-sided row shows no values. Undefined ⇒ no diff block.
    const changes = diffChanges(r.before_data, r.after_data);

    items.push({
      id: r.id,
      at: r.created_at,
      title,
      tone,
      subtitle,
      ref,
      actor: r.actor_name ?? undefined,
      actorStaffId: r.actor_staff_id ?? null,
      changes: changes.length ? changes : undefined,
      sourceEventType: r.action,
    });
  }
  return items;
}
