/**
 * Past tracking numbers of one order — the numbers a manual replace overwrote
 * (audit `orders.tracking.replaced`) plus labels voided / unlinked off it.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export type TrackingHistoryReason = 'replaced' | 'voided' | 'unlinked';

export interface TrackingHistoryEntry {
  trackingNumber: string;
  /** ISO. */
  replacedAt: string;
  replacedBy: string | null;
  reason: TrackingHistoryReason;
}

export interface TrackingHistorySources {
  replaced: ReadonlyArray<{ previous: string | null; next: string | null; at: string; actor: string | null }>;
  labels: ReadonlyArray<{ tracking: string | null; status: string; at: string; actor: string | null }>;
}

const trackingKey = (value: string) => value.replace(/\s+/g, '').toUpperCase();

/**
 * Merge both sources newest first: one entry per number (its most recent
 * departure), never the order's current number. A cleared number reads as
 * `unlinked`, a swapped one as `replaced`.
 */
export function mergeTrackingHistory(sources: TrackingHistorySources, current: string | null): TrackingHistoryEntry[] {
  const all: TrackingHistoryEntry[] = [];
  for (const r of sources.replaced) {
    const prev = r.previous?.trim();
    if (!prev) continue;
    all.push({ trackingNumber: prev, replacedAt: r.at, replacedBy: r.actor, reason: r.next?.trim() ? 'replaced' : 'unlinked' });
  }
  for (const l of sources.labels) {
    const t = l.tracking?.trim();
    if (!t || (l.status !== 'voided' && l.status !== 'unlinked')) continue;
    all.push({ trackingNumber: t, replacedAt: l.at, replacedBy: l.actor, reason: l.status as TrackingHistoryReason });
  }
  all.sort((a, b) => Date.parse(b.replacedAt) - Date.parse(a.replacedAt));
  const seen = new Set<string>(current?.trim() ? [trackingKey(current)] : []);
  return all.filter((e) => {
    const k = trackingKey(e.trackingNumber);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Read and merge; null when the order is not in the org. */
export async function getOrderTrackingHistory(
  orgId: OrgId,
  orderId: number,
): Promise<{ current: string | null; entries: TrackingHistoryEntry[] } | null> {
  const [order, audits, labels] = await Promise.all([
    tenantQuery<{ tracking: string | null }>(
      orgId,
      `SELECT stn.tracking_number_raw AS tracking
         FROM orders o
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        WHERE o.id = $1 AND o.organization_id = $2`,
      [orderId, orgId],
    ),
    tenantQuery<{ previous: string | null; next: string | null; at: Date; actor: string | null }>(
      orgId,
      `SELECT al.after_data->>'previousTrackingNumber' AS previous,
              al.after_data->>'trackingNumber' AS next,
              al.created_at AS at, s.name AS actor
         FROM audit_logs al
         LEFT JOIN staff s ON s.id = al.actor_staff_id
        WHERE al.organization_id = $2 AND lower(al.entity_type) = 'order'
          AND al.entity_id = $1::text AND al.action = 'orders.tracking.replaced'`,
      [orderId, orgId],
    ),
    tenantQuery<{ tracking: string | null; status: string; at: Date; actor: string | null }>(
      orgId,
      `SELECT lp.tracking_number AS tracking, lp.status,
              COALESCE(lp.unlinked_at, vd.created_at, lp.updated_at) AS at,
              COALESCE(su.name, vd.actor) AS actor
         FROM shipping_label_purchases lp
         LEFT JOIN staff su ON su.id = lp.unlinked_by
         LEFT JOIN LATERAL (
           SELECT al.created_at, s.name AS actor
             FROM audit_logs al
             LEFT JOIN staff s ON s.id = al.actor_staff_id
            WHERE lp.status = 'voided' AND al.organization_id = lp.organization_id
              AND al.action = 'orders.label.voided' AND lower(al.entity_type) = 'order'
              AND al.entity_id = lp.order_id::text AND al.before_data->>'labelId' = lp.label_id
            ORDER BY al.created_at DESC LIMIT 1
         ) vd ON TRUE
        WHERE lp.organization_id = $2 AND lp.order_id = $1 AND lp.status IN ('voided', 'unlinked')`,
      [orderId, orgId],
    ),
  ]);
  if (order.rows.length === 0) return null;
  const current = order.rows[0].tracking;
  return { current, entries: mergeTrackingHistory(
      {
        replaced: audits.rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
        labels: labels.rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
      },
      current,
    ) };
}
