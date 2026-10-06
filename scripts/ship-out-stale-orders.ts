/**
 * ship-out-stale-orders.ts — clear packages that already left the building but
 * never got a pack or scan-out here (e.g. Amazon imports landing
 * `orders.status = 'shipped'` with USPS tracking, which is not polled). For
 * operator-authorized backlog clears only.
 *
 * Per package still owed a pick or a pack on the Live feed (To pick / Picked):
 *   1. a COMPLETED packer log (`createPackerLog`) + PACK_COMPLETED station event
 *      + PACK_COMPLETED audit — the pack facts the dock scan-out requires;
 *   2. the dock scan-out (`scanOutKnownShipment`, origin `bulk`).
 * Both are stamped at the package's ship-by, or when it entered its stage if
 * that is later or it has no ship-by — never before a pick that already happened.
 * `orders.status` is never written: the channel's later word
 * (`shipped`) must not be rolled back to `packed`.
 *
 *   node --env-file=.env --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     scripts/ship-out-stale-orders.ts --orders=<order number>,… [--org=<uuid>] [--staff=<id>] [--apply]
 *
 * Dry run by default; `--staff` defaults to 1. Idempotent: a package already
 * packed or scanned out is not on To pick / Picked and is skipped.
 */
import pool from '@/lib/db';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { loadLiveFeedPackages } from '@/lib/live-feed/load';
import type { PackageCard } from '@/lib/live-feed/types';
import { createPackerLog } from '@/lib/packing/packer-log-writer';
import { createStationActivityLog } from '@/lib/station-activity';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { scanOutKnownShipment, type ScanOutResult } from '@/lib/outbound/scan-out';
import { normalizePSTTimestamp } from '@/utils/date';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const APPLY = process.argv.includes('--apply');
const ORG = (arg('org') ?? DOGFOOD_ORG_ID) as OrgId;
const STAFF = Number(arg('staff') ?? 1);
const ORDER_NUMBERS = [...new Set((arg('orders') ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
const SOURCE = 'scripts.ship-out-stale-orders';

async function pack(card: PackageCard & { shipmentId: number; tracking: string }, at: string): Promise<string> {
  return withTenantTransaction(ORG, async (client) => {
    const log = await createPackerLog(client, {
      organizationId: ORG,
      shipmentId: card.shipmentId,
      scanRef: card.tracking,
      trackingType: 'ORDERS',
      packedBy: STAFF,
      createdAt: normalizePSTTimestamp(at),
      source: SOURCE,
    });
    if (!log) throw new Error('packer log not written');
    const salId = await createStationActivityLog(client, {
      organizationId: ORG,
      station: 'PACK',
      activityType: 'PACK_COMPLETED',
      staffId: STAFF,
      shipmentId: card.shipmentId,
      scanRef: card.tracking,
      packerLogId: log.id,
      notes: 'Backfilled pack (operator-authorized backlog clear)',
      metadata: { source: SOURCE, tracking_type: 'ORDERS', order_id: card.orderNumber, order_row_id: card.orderRowId },
      createdAt: log.createdAt,
    });
    await refreshOrderStageFacts(ORG, { orderIds: [card.orderRowId], shipmentIds: [card.shipmentId] }, client);
    await recordAudit(client, null, null, {
      source: SOURCE,
      action: AUDIT_ACTION.PACK_COMPLETED,
      entityType: 'ORDER',
      entityId: String(card.orderRowId),
      stationActivityLogId: salId,
      method: 'system',
      actorStaffIdOverride: STAFF,
      organizationIdOverride: ORG,
      extra: { shipment_id: card.shipmentId, order_id: card.orderNumber, backfill: true },
    });
    return log.createdAt;
  });
}

async function main(): Promise<void> {
  if (ORDER_NUMBERS.length === 0) throw new Error('--orders=<order number>,… is required');
  const staff = await pool.query<{ name: string }>(
    `SELECT name FROM staff WHERE id = $1 AND organization_id = $2`,
    [STAFF, ORG],
  );
  if (!staff.rows[0]) throw new Error(`--staff=${STAFF} is not a staff member of ${ORG}`);

  const found = await pool.query<{ id: number; order_id: string }>(
    `SELECT id, order_id FROM orders WHERE organization_id = $1 AND order_id = ANY($2::text[])`,
    [ORG, ORDER_NUMBERS],
  );
  const missing = ORDER_NUMBERS.filter((n) => !found.rows.some((r) => r.order_id === n));
  if (missing.length > 0) throw new Error(`--orders not found in ${ORG}: ${missing.join(', ')}`);

  const cards = await loadLiveFeedPackages(ORG, found.rows.map((r) => Number(r.id)));
  const owed = cards.filter((c) => c.stage === 'to_pick' || c.stage === 'picked');
  const targets = owed.filter(
    (c): c is PackageCard & { shipmentId: number; tracking: string } => c.shipmentId != null && Boolean(c.tracking?.trim()),
  );
  const skipped = ORDER_NUMBERS.filter((n) => !targets.some((c) => c.orderNumber === n));

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — org ${ORG}, as staff ${STAFF} (${staff.rows[0].name})`);
  /** Ship-by, unless the package entered its stage after it (a late pick): then that entry. */
  const stampFor = (c: PackageCard): string | null =>
    [c.shipBy, c.enteredAt].filter((v): v is string => v != null).sort().at(-1) ?? null;
  console.table(
    targets.map((c) => ({ order: c.orderNumber, stage: c.stage, shipment: c.shipmentId, tracking: c.tracking, at: stampFor(c) })),
  );
  if (skipped.length > 0) console.log(`Skipped (not on To pick / Picked, or no label): ${skipped.join(', ')}`);
  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply.');
    return;
  }

  const outcomes: Array<{ order: string | null; packedAt?: string; result: ScanOutResult['kind'] | 'error'; detail?: string }> = [];
  for (const card of targets) {
    const at = stampFor(card);
    if (!at) {
      outcomes.push({ order: card.orderNumber, result: 'error', detail: 'no ship-by or stage time' });
      continue;
    }
    try {
      const packedAt = await pack(card, at);
      const result = await scanOutKnownShipment({
        organizationId: ORG,
        shipmentId: card.shipmentId,
        scan: card.tracking,
        actorStaffId: STAFF,
        createdAt: packedAt,
        origin: 'bulk',
      });
      outcomes.push({
        order: card.orderNumber,
        packedAt,
        result: result.kind,
        detail: result.kind === 'blocked' ? result.blockReason : undefined,
      });
    } catch (err) {
      outcomes.push({ order: card.orderNumber, result: 'error', detail: err instanceof Error ? err.message : String(err) });
    }
  }
  console.table(outcomes);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
