/**
 * Reattach orphan packages to the orders that own them.
 *
 * An orphan is a package the dock scanned (`receiving_scans`) that landed as
 * an `unmatched` carton with no order, because the order did not know the
 * tracking yet at scan time. The sync now claims these the moment an order
 * learns the number (`claimPendingIdentifierCartons`); this script runs that
 * same claim once for every order that ALREADY carries a scanned number, so
 * the backlog lands exactly the way new ones will.
 *
 * Every orphan is reported in one bucket:
 *   claim          — one order carries the scanned number; claimed on --apply
 *   needs_person   — that order's own carton already has physical progress
 *                    (two records for one order); never merged automatically
 *   ambiguous      — the scanned number names several orders
 *   return_repair  — a return / repair intake: no purchase order is expected
 *   no_order       — no order anywhere carries the scanned number
 *
 * Dry-run by default (writes nothing):
 *   tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/backfill-orphan-cartons.ts
 *   … --apply      claim the `claim` bucket
 *   … --org=<uuid> (default: the dogfood org)
 *   … --list       print every orphan id with its bucket
 */
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  MIN_SCANNED_KEY_LENGTH,
  PENDING_CARTON_CANDIDATES_SQL,
  claimPendingIdentifierCartons,
} from '@/lib/receiving/link-pending-identifier';
import { normalizeIdentifierKey } from '@/lib/receiving/link-carton-identifier';

type Bucket = 'claim' | 'needs_person' | 'ambiguous' | 'return_repair' | 'no_order';

interface Orphan {
  id: number;
  keys: string[];
  is_return_or_repair: boolean;
}

interface OrderHit {
  po_id: string;
  po_number: string | null;
  reference_number: string | null;
  key: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const list = process.argv.includes('--list');
  const orgArg = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);
  const orgId = (orgArg || DOGFOOD_ORG_ID) as OrgId;

  const orphans = (
    await tenantQuery<Orphan>(
      orgId,
      `SELECT r.id,
              array_agg(DISTINCT upper(regexp_replace(s.tracking_number, '[^A-Za-z0-9]', '', 'g'))) AS keys,
              (COALESCE(r.is_return, false) OR COALESCE(r.intake_type, '') IN ('RETURN', 'REPAIR')) AS is_return_or_repair
         FROM receiving_carton r
         JOIN receiving_scans s ON s.receiving_id = r.id AND s.organization_id = r.organization_id
        WHERE r.organization_id = $1
          AND r.source = 'unmatched'
          AND r.zoho_purchaseorder_id IS NULL
        GROUP BY r.id
        ORDER BY r.id`,
      [orgId],
    )
  ).rows;

  const scanKeys = [
    ...new Set(orphans.flatMap((o) => o.keys).filter((k) => k.length >= MIN_SCANNED_KEY_LENGTH)),
  ];
  const hits = (
    await tenantQuery<OrderHit>(
      orgId,
      `SELECT m.zoho_purchaseorder_id AS po_id, m.zoho_purchaseorder_number AS po_number,
              m.reference_number, k.key
         FROM unnest($2::text[]) AS k(key)
         JOIN zoho_po_mirror m
           ON m.organization_id = $1
          AND (NULLIF(upper(regexp_replace(COALESCE(m.reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = k.key
               OR m.zoho_purchaseorder_number_norm = k.key)
          AND COALESCE(m.status, '') NOT IN ('cancelled', 'draft')`,
      [orgId, scanKeys],
    )
  ).rows;
  const ordersByKey = new Map<string, OrderHit[]>();
  for (const hit of hits) ordersByKey.set(hit.key, [...(ordersByKey.get(hit.key) ?? []), hit]);

  // Which orphans the claim itself would take, per order — the claim's own SQL.
  const claimable = new Map<string, Set<number>>();
  const orders = new Map<string, OrderHit>();
  for (const hit of hits) orders.set(hit.po_id, hit);
  for (const order of orders.values()) {
    const keys = [order.po_number, order.reference_number, order.po_id]
      .map((v) => normalizeIdentifierKey(v))
      .filter((k, i, all) => k.length > 0 && all.indexOf(k) === i);
    const { rows } = await tenantQuery<{ id: number }>(orgId, PENDING_CARTON_CANDIDATES_SQL, [
      orgId,
      keys,
      keys.filter((k) => k.length >= MIN_SCANNED_KEY_LENGTH),
      order.po_id,
    ]);
    claimable.set(order.po_id, new Set(rows.map((r) => Number(r.id))));
  }

  const bucketOf = new Map<number, { bucket: Bucket; order: OrderHit | null }>();
  for (const orphan of orphans) {
    const owners = new Map<string, OrderHit>();
    for (const key of orphan.keys) for (const hit of ordersByKey.get(key) ?? []) owners.set(hit.po_id, hit);
    if (owners.size > 1) {
      bucketOf.set(orphan.id, { bucket: 'ambiguous', order: null });
    } else if (owners.size === 1) {
      const order = [...owners.values()][0];
      const claim = claimable.get(order.po_id)?.has(Number(orphan.id)) ?? false;
      bucketOf.set(orphan.id, { bucket: claim ? 'claim' : 'needs_person', order });
    } else {
      bucketOf.set(orphan.id, { bucket: orphan.is_return_or_repair ? 'return_repair' : 'no_order', order: null });
    }
  }

  const counts: Record<Bucket, number> = { claim: 0, needs_person: 0, ambiguous: 0, return_repair: 0, no_order: 0 };
  for (const { bucket } of bucketOf.values()) counts[bucket] += 1;
  console.log(`org ${orgId}: ${orphans.length} scanned packages with no order link`);
  for (const [bucket, n] of Object.entries(counts)) console.log(`  ${bucket.padEnd(14)} ${n}`);
  if (list) {
    for (const [id, { bucket, order }] of bucketOf) {
      console.log(`${String(id).padStart(7)}  ${bucket.padEnd(14)} ${order ? `PO ${order.po_number ?? order.po_id}` : ''}`);
    }
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply to claim the `claim` bucket.');
    return;
  }

  // One claim per owning order: the same call the sync makes on every import.
  const claimOrders = new Map<string, OrderHit>();
  for (const { bucket, order } of bucketOf.values()) if (bucket === 'claim' && order) claimOrders.set(order.po_id, order);
  let claimed = 0;
  let lines = 0;
  for (const order of claimOrders.values()) {
    const result = await claimPendingIdentifierCartons(orgId, {
      poId: order.po_id,
      poNumber: order.po_number,
      referenceNumber: order.reference_number,
    });
    claimed += result.claimed;
    lines += result.linesImported;
    console.log(`PO ${order.po_number ?? order.po_id}: claimed ${result.claimed}/${result.matched}, ${result.linesImported} line(s)`);
  }
  console.log(`\nClaimed ${claimed} package(s) onto ${claimOrders.size} order(s); ${lines} line(s) on them.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
