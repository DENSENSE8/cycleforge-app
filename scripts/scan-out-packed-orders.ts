/**
 * scan-out-packed-orders.ts — dock-scan-out every PACKED order still sitting on
 * the To ship desk, through the same {@link scanOutLabel} the Scan out verb and
 * the dock gun use (SHIP_CONFIRM event + SHIP_CONFIRM_SCAN audit + allocation
 * mirror). For operator-authorized backlog clears only: it records that these
 * cartons left the building.
 *
 * Membership mirrors `/api/orders?inWarehouse=true` (the To ship desk) narrowed
 * to rows the desk paints as packed (`packed_at ?? pack_activity_at`): labeled
 * + tracked, not carrier-shipped, not AFN, no SHIP_CONFIRM yet, and a COMPLETED
 * packer log or PACK station event on the shipment. One scan per shipment.
 *
 * Per-shipment and idempotent: a re-run skips what already left; one failure
 * never stops the rest. Cancelled / carrier-delivered / unresolvable labels are
 * refused by the domain function and reported, never forced.
 *
 *   node --env-file=.env --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     scripts/scan-out-packed-orders.ts [--org=<uuid>] [--staff=<id>] [--packed-before=YYYY-MM-DD] \
 *     [--orders=<order number>,…] [--at-pack-time] [--apply]
 *
 * Dry run by default. `--staff` defaults to 1 (the owner), which is who every
 * earlier bulk scan-out in the dogfood org is attributed to. `--packed-before`
 * keeps only shipments packed before that day's midnight, Pacific time.
 * `--orders` narrows to the shipments carrying those order numbers (`orders.order_id`);
 * a number that matches no order row is refused before anything is written.
 * `--at-pack-time` stamps each SHIP_CONFIRM at its shipment's pack time
 * instead of now — the backfill convention (scan-out sits 0 min after the pack).
 */
import pool from '@/lib/db';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { loadPackedOnToShip, type PackedShipment } from '@/lib/outbound/packed-on-to-ship';
import { scanOutKnownShipment, type ScanOutResult } from '@/lib/outbound/scan-out';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const APPLY = process.argv.includes('--apply');
const ORG = arg('org') ?? DOGFOOD_ORG_ID;
const STAFF = Number(arg('staff') ?? 1);
const PACKED_BEFORE = arg('packed-before');
const ORDER_NUMBERS = [...new Set((arg('orders') ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
const AT_PACK_TIME = process.argv.includes('--at-pack-time');

/** Midnight at the start of `day` (YYYY-MM-DD) in America/Los_Angeles, as an instant. */
function pacificMidnight(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--packed-before must be YYYY-MM-DD (got ${day})`);
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  // Pacific's offset on that day (PDT −7 / PST −8), read from the zone itself.
  const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
    .formatToParts(utcMidnight)
    .find((part) => part.type === 'timeZoneName')?.value;
  const hours = Number(/GMT([+-]\d+)/.exec(zoneName ?? '')?.[1]);
  if (!Number.isFinite(hours)) throw new Error(`could not read the Pacific offset for ${day}`);
  return new Date(utcMidnight.getTime() - hours * 3_600_000);
}

function tally<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

async function main(): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ORG)) {
    throw new Error(`--org must be a UUID (got ${ORG})`);
  }
  const staff = await pool.query<{ name: string }>(
    `SELECT name FROM staff WHERE id = $1 AND organization_id = $2`,
    [STAFF, ORG],
  );
  if (!staff.rows[0]) throw new Error(`--staff=${STAFF} is not a staff member of ${ORG}`);

  const cutoff = PACKED_BEFORE ? pacificMidnight(PACKED_BEFORE) : null;
  let orderRowIds: number[] | null = null;
  if (ORDER_NUMBERS.length > 0) {
    const found = await pool.query<{ id: number; order_id: string }>(
      `SELECT id, order_id FROM orders WHERE organization_id = $1 AND order_id = ANY($2::text[])`,
      [ORG, ORDER_NUMBERS],
    );
    const missing = ORDER_NUMBERS.filter((n) => !found.rows.some((r) => r.order_id === n));
    if (missing.length > 0) throw new Error(`--orders not found in ${ORG}: ${missing.join(', ')}`);
    orderRowIds = found.rows.map((r) => r.id);
  }
  const shipments = (await loadPackedOnToShip(ORG, orderRowIds)).filter(
    (s) => !cutoff || new Date(s.packed_at) < cutoff,
  );
  if (orderRowIds) {
    const covered = new Set(shipments.flatMap((s) => s.order_ids));
    const notPacked = ORDER_NUMBERS.filter((n) => !covered.has(n));
    if (notPacked.length > 0) {
      console.log(`Not packed on To ship (already scanned out, carrier-shipped, or never packed): ${notPacked.join(', ')}`);
    }
  }
  if (cutoff) console.log(`Packed before ${PACKED_BEFORE} (Pacific) = before ${cutoff.toISOString()}`);
  const orderCount = shipments.reduce((n, s) => n + s.order_row_ids.length, 0);
  const unfoundCount = shipments.filter((s) => s.order_row_ids.length === 0).length;
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} — org ${ORG}, as staff ${STAFF} (${staff.rows[0].name})`,
  );
  console.log(
    `Packed on To ship: ${shipments.length} identification(s); ${orderCount} linked order row(s); ${unfoundCount} unfound/unmatched`,
  );
  console.table(tally(shipments, (s) => `${s.account_source ?? '(unfound)'} · ${s.status ?? '(none)'}`));
  console.table(
    shipments.slice(-10).map((s) => ({
      shipment: s.shipment_id,
      orders: s.order_ids.join(',') || '(unfound)',
      source: s.account_source,
      status: s.status,
      tracking: s.tracking,
      packed_at: s.packed_at.toISOString(),
    })),
  );

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to scan these out.');
    return;
  }

  const outcomes: Array<{ shipment: PackedShipment; kind: ScanOutResult['kind'] | 'error'; detail?: string }> = [];
  for (const shipment of shipments) {
    try {
      const result = await scanOutKnownShipment({
        organizationId: ORG,
        shipmentId: Number(shipment.shipment_id),
        scan: shipment.tracking,
        actorStaffId: STAFF,
        createdAt: AT_PACK_TIME ? new Date(shipment.packed_at).toISOString() : null,
        origin: 'bulk',
      });
      const detail =
        result.kind === 'unmatched'
          ? 'label did not resolve'
          : result.carton.shipmentId !== Number(shipment.shipment_id)
            ? `resolved to shipment ${result.carton.shipmentId}`
            : result.kind === 'blocked'
              ? result.blockReason
              : undefined;
      outcomes.push({ shipment, kind: result.kind, detail });
    } catch (err) {
      outcomes.push({ shipment, kind: 'error', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log('\nOutcomes (per shipment):');
  console.table(tally(outcomes, (o) => o.kind));
  const skipped = outcomes.filter((o) => o.kind !== 'confirmed' && o.kind !== 'duplicate');
  const mismatched = outcomes.filter((o) => o.detail?.startsWith('resolved to'));
  for (const o of [...skipped, ...mismatched]) {
    console.log(
      `  ${o.kind.padEnd(18)} shipment ${o.shipment.shipment_id} orders ${o.shipment.order_ids.join(',')} ` +
        `${o.shipment.tracking}${o.detail ? ` — ${o.detail}` : ''}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
