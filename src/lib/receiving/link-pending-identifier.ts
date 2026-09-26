/** Claim the cartons that were waiting for THIS order to be imported. */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { relinkReceivingPo, type TxClient } from './relink-po';
import { normalizeIdentifierKey } from './link-carton-identifier';

export interface ClaimPendingIdentifierInput {
  poId: string;
  poNumber?: string | null;
  referenceNumber?: string | null;
}

export interface ClaimPendingIdentifierResult {
  /** Cartons whose pending identifier matched this order. */
  matched: number;
  /** Of those, how many linked successfully. */
  claimed: number;
  /** Lines adopted/imported across every claimed carton. */
  linesImported: number;
}

export interface ClaimPendingIdentifierDeps {
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  relink: typeof relinkReceivingPo;
}

const defaultDeps: ClaimPendingIdentifierDeps = {
  runTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
  relink: relinkReceivingPo,
};

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

  const empty: ClaimPendingIdentifierResult = { matched: 0, claimed: 0, linesImported: 0 };
  if (!poId || keys.length === 0) return empty;

  // Only UNMATCHED cartons with a recorded identifier are candidates — a carton
  // that already carries a real PO is nobody's to re-point from a sync.
  const { rows } = await deps.runTx(orgId, (client) =>
    client.query(
      `SELECT id
         FROM receiving_carton
        WHERE organization_id = $1
          AND source = 'unmatched'
          AND zoho_purchaseorder_id IS NULL
          AND source_order_id IS NOT NULL
          AND upper(regexp_replace(source_order_id, '[^A-Za-z0-9]', '', 'g')) = ANY($2::text[])
        ORDER BY id ASC
        LIMIT 50`,
      [orgId, keys],
    ),
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
