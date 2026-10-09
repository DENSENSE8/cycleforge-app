/**
 * Pair — the Live feed's backfill verb: a card no order owns (a packed box,
 * `link = 'package'`, or an unmatched dock scan, `link = 'scan'`) is linked to
 * the order the operator names, and the board repaints it as that order.
 *
 *  - box: the shipment gets the order's ORDER link (`linkShipmentToOrderInTx`,
 *    the exception resolve's own writer);
 *  - scan: its text is registered as a tracking (`registerShipmentPermissive`),
 *    the scan-out rows of that text are backfilled onto the shipment (they ARE
 *    the box's scan-out — who scanned it, when), then the box is linked.
 *
 * A box with an open unmatched-scan exception resolves through
 * `resolveShipmentException`, so the Exceptions desk agrees. The card's active
 * flags follow it to the order, and the order's stage facts are recomputed so
 * the board reads the new stage at once.
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { moveLiveFeedFlagsToOrder, SCAN_KEY_SQL } from '@/lib/live-feed/card-writes';
import { cardSubject } from '@/lib/live-feed/subjects';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import {
  linkShipmentToOrderInTx,
  loadShipmentResolveTarget,
  resolveShipmentException,
} from '@/lib/shipments/resolve-shipment-exception';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';

export const LIVE_FEED_PAIR_SOURCE = 'live-feed.pair';

export type PairOutcome =
  | { ok: true; orderRowId: number; shipmentId: number; tracking: string; backfilledScans: number }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string };

export async function pairLiveFeedCard(args: {
  orgId: OrgId;
  staffId: number | null;
  cardId: number;
  orderRowId: number;
}): Promise<PairOutcome> {
  const { orgId, staffId, orderRowId } = args;
  const subject = cardSubject(args.cardId);
  if (!subject || subject.kind === 'order') {
    return { ok: false, status: 400, error: 'Only a box or a scan no order owns can be paired' };
  }

  const order = (
    await tenantQuery<{ id: number; order_id: string | null }>(
      orgId,
      `SELECT id, order_id FROM orders WHERE organization_id = $1 AND id = $2`,
      [orgId, orderRowId],
    )
  ).rows[0];
  if (!order) return { ok: false, status: 404, error: 'Order not found' };

  let shipmentId: number;
  let scanKey: string | null = null;
  if (subject.kind === 'package') {
    shipmentId = subject.shipmentId;
  } else {
    const scan = (
      await tenantQuery<{ scan_ref: string | null; scan_key: string }>(
        orgId,
        `SELECT NULLIF(BTRIM(sal.scan_ref), '') AS scan_ref, ${SCAN_KEY_SQL('sal')} AS scan_key
           FROM station_activity_logs sal
          WHERE sal.organization_id = $1 AND sal.id = $2 AND sal.activity_type = 'SHIP_CONFIRM'`,
        [orgId, subject.scanId],
      )
    ).rows[0];
    if (!scan) return { ok: false, status: 404, error: 'Scan not found' };
    if (!scan.scan_ref) return { ok: false, status: 422, error: 'This scan carried no text to pair' };
    const shipment = await registerShipmentPermissive({ trackingNumber: scan.scan_ref, sourceSystem: LIVE_FEED_PAIR_SOURCE }, orgId);
    if (shipment?.id == null) return { ok: false, status: 422, error: `${scan.scan_ref} is not a tracking number` };
    shipmentId = Number(shipment.id);
    scanKey = scan.scan_key;
  }

  // A box another order already ships on is that order's — pair it there, not here.
  const owner = (
    await tenantQuery<{ id: number; order_id: string | null }>(
      orgId,
      `SELECT o.id, o.order_id
         FROM orders o
        WHERE o.organization_id = $1
          AND o.id <> $3
          AND (o.shipment_id = $2
               OR EXISTS (SELECT 1 FROM shipment_links sl
                           WHERE sl.organization_id = $1 AND sl.owner_type = 'ORDER'
                             AND sl.owner_id = o.id AND sl.shipment_id = $2))
        LIMIT 1`,
      [orgId, shipmentId, orderRowId],
    )
  ).rows[0];
  if (owner) {
    return { ok: false, status: 409, error: `That tracking already ships order ${owner.order_id ?? `#${owner.id}`} — pair it to that order` };
  }

  const target = await loadShipmentResolveTarget(orgId, shipmentId);
  if (!target) return { ok: false, status: 404, error: 'Package not found' };

  // The exception path links inside the resolve (and replays a held dock scan, a no-op once backfilled).
  const backfill = async (tx: PoolClient) =>
    scanKey == null
      ? 0
      : ((
          await tx.query(
            `UPDATE station_activity_logs sal
                SET shipment_id = $2
              WHERE sal.organization_id = $1
                AND sal.activity_type = 'SHIP_CONFIRM'
                AND sal.shipment_id IS NULL
                AND ${SCAN_KEY_SQL('sal')} = $3`,
            [orgId, shipmentId, scanKey],
          )
        ).rowCount ?? 0);

  let backfilledScans = 0;
  if (target.openExceptionId != null) {
    backfilledScans = await withTenantTransaction(orgId, backfill);
    const resolved = await resolveShipmentException({
      orgId,
      staffId,
      shipmentId,
      body: { kind: 'link-order', orderRowId, clientEventId: randomUUID() },
    });
    if (resolved.status !== 200) return { ok: false, status: resolved.status, error: resolved.error };
  } else {
    const linked = await withTenantTransaction(orgId, async (tx) => {
      backfilledScans = await backfill(tx);
      return linkShipmentToOrderInTx(tx, orgId, {
        shipmentId,
        orderRowId,
        staffId,
        source: LIVE_FEED_PAIR_SOURCE,
        metadata: { card_id: args.cardId, scan_key: scanKey },
      });
    });
    if (!linked) return { ok: false, status: 404, error: 'Order not found' };
  }

  await withTenantTransaction(orgId, async (tx) => {
    await moveLiveFeedFlagsToOrder(tx, { orgId, shipmentId: subject.kind === 'package' ? shipmentId : null, scanKey, orderId: orderRowId });
    await refreshOrderStageFacts(orgId, { orderIds: [orderRowId], shipmentIds: [shipmentId] }, tx);
  });

  return { ok: true, orderRowId, shipmentId, tracking: target.tracking, backfilledScans };
}
