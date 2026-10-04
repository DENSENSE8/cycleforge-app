/**
 * Claim the cartons that were waiting for THIS order to be imported.
 *
 * A package can be scanned before its order knows its tracking (the seller
 * adds the tracking to the PO hours later). The scan then has nothing to
 * match and lands as an `unmatched` carton — an orphan. Every time an order
 * is (re)imported, this claims those orphans back onto it, by either:
 * - the identifier an operator recorded on the carton (`source_order_id`), or
 * - a tracking / order number the dock actually scanned on it
 *   (`receiving_scans`), when the order now carries that number.
 *
 * A scan match never steals onto an order whose own carton already has
 * physical progress (door scan, opened, units received): that is two physical
 * records for one order, and a person decides which box is which.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { relinkReceivingPo, type TxClient } from './relink-po';
import { normalizeIdentifierKey } from './link-carton-identifier';
import { cartonHasPhysicalProgressSql } from './claim-zoho-po-shell';

interface ClaimPendingIdentifierInput {
  poId: string;
  poNumber?: string | null;
  referenceNumber?: string | null;
}

interface ClaimPendingIdentifierResult {
  /** Cartons whose pending identifier matched this order. */
  matched: number;
  /** Of those, how many linked successfully. */
  claimed: number;
  /** Lines adopted/imported across every claimed carton. */
  linesImported: number;
}

interface ClaimPendingIdentifierDeps {
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  relink: typeof relinkReceivingPo;
}

const defaultDeps: ClaimPendingIdentifierDeps = {
  runTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
  relink: relinkReceivingPo,
};

/** Shortest scanned value treated as a tracking / order identity (skips "PICKUP", "LCPU", stray digits). */
export const MIN_SCANNED_KEY_LENGTH = 8;

/**
 * Orphan cartons this order should own. $1 org · $2 every identifier key ·
 * $3 the keys long enough to match a scan · $4 the order's PO id. Shared with
 * `scripts/backfill-orphan-cartons.ts` so the backfill and the sync claim the
 * exact same set.
 */
export const PENDING_CARTON_CANDIDATES_SQL = `
  SELECT c.id
    FROM receiving_carton c
   WHERE c.organization_id = $1
     AND c.source = 'unmatched'
     AND c.zoho_purchaseorder_id IS NULL
     AND (
       (c.source_order_id IS NOT NULL
         AND upper(regexp_replace(c.source_order_id, '[^A-Za-z0-9]', '', 'g')) = ANY($2::text[]))
       OR (
         EXISTS (
           SELECT 1 FROM receiving_scans rs
            WHERE rs.receiving_id = c.id
              AND rs.organization_id = c.organization_id
              AND upper(regexp_replace(rs.tracking_number, '[^A-Za-z0-9]', '', 'g')) = ANY($3::text[])
         )
         AND NOT EXISTS (
           SELECT 1 FROM receiving_carton shell
            WHERE shell.organization_id = c.organization_id
              AND shell.source = 'zoho_po'
              AND shell.zoho_purchaseorder_id = $4
              AND ${cartonHasPhysicalProgressSql('shell')}
         )
       )
     )
   ORDER BY c.id ASC
   LIMIT 50`;

export async function claimPendingIdentifierCartons(
  orgId: OrgId,
  input: ClaimPendingIdentifierInput,
  deps: ClaimPendingIdentifierDeps = defaultDeps,
): Promise<ClaimPendingIdentifierResult> {
  const poId = String(input.poId ?? '').trim();
  const keys = [
    normalizeIdentifierKey(input.poNumber),
    normalizeIdentifierKey(input.referenceNumber),
    normalizeIdentifierKey(poId),
  ].filter((key, index, all) => key.length > 0 && all.indexOf(key) === index);
  const scanKeys = keys.filter((key) => key.length >= MIN_SCANNED_KEY_LENGTH);

  const empty: ClaimPendingIdentifierResult = { matched: 0, claimed: 0, linesImported: 0 };
  if (!poId || keys.length === 0) return empty;

  // Only UNMATCHED cartons are candidates — a carton that already carries a
  // real PO is nobody's to re-point from a sync.
  const { rows } = await deps.runTx(orgId, (client) =>
    client.query(PENDING_CARTON_CANDIDATES_SQL, [orgId, keys, scanKeys, poId]),
  );
  if (rows.length === 0) return empty;

  let claimed = 0;
  let linesImported = 0;
  for (const row of rows) {
    const receivingId = Number(row.id);
    try {
      const result = await deps.relink(
        {
          receivingId,
          scope: 'carton',
          zohoPurchaseorderId: poId,
          zohoPurchaseorderNumber: input.poNumber ?? null,
        },
        orgId,
      );
      if (result.ok) {
        claimed += 1;
        linesImported += result.linesImported ?? 0;
      }
    } catch (err) {
      console.warn(
        `[link-pending-identifier] claim failed carton=${receivingId} po=${poId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { matched: rows.length, claimed, linesImported };
}
