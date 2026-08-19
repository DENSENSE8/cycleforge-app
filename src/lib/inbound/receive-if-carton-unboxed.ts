/**
 * When an Amazon/eBay/manual inbound line is attached to a carton that Unbox
 * already opened, local-receive it (qty + DONE) so it leaves Incoming.
 * Zoho is not involved — same intent as mark-received-po `local_receive`.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { receiveLineUnits } from '@/lib/receiving/receive-line';

export interface ReceiveIfUnboxedHit {
  receivingLineId: number;
  receivingId: number;
  received: boolean;
}

export interface ReceiveIfCartonUnboxedDeps {
  query: typeof tenantQuery;
  receiveLineUnits: typeof receiveLineUnits;
}

const defaultDeps: ReceiveIfCartonUnboxedDeps = {
  query: async (orgId, sql, params) => {
    const { tenantQuery: tq } = await import('@/lib/tenancy/db');
    return tq(orgId, sql, params);
  },
  receiveLineUnits,
};

export async function receiveImportedLineIfCartonUnboxed(
  orgId: OrgId,
  receivingLineId: number,
  deps: ReceiveIfCartonUnboxedDeps = defaultDeps,
): Promise<ReceiveIfUnboxedHit | null> {
  const r = await deps.query<{
    receiving_id: number | null;
    quantity_expected: number | null;
    quantity_received: number | null;
    workflow_status: string | null;
    unboxed_at: string | null;
    opened_at: string | null;
    unbox_scan: number | null;
  }>(
    orgId,
    `SELECT rl.receiving_id,
            rl.quantity_expected,
            rl.quantity_received,
            rl.workflow_status::text AS workflow_status,
            ru.unboxed_at::text AS unboxed_at,
            ru.opened_at::text AS opened_at,
            (SELECT rs.id FROM receiving_scans rs
              WHERE rs.receiving_id = rl.receiving_id
                AND rs.intake_surface = 'unbox'
              LIMIT 1) AS unbox_scan
       FROM receiving_line rl
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rl.receiving_id
        AND ru.organization_id = rl.organization_id
      WHERE rl.id = $1 AND rl.organization_id = $2::uuid
      LIMIT 1`,
    [receivingLineId, orgId],
  );
  const row = r.rows[0];
  if (row?.receiving_id == null) return null;
  const alreadyUnboxed = Boolean(row.unboxed_at || row.opened_at || row.unbox_scan);
  if (!alreadyUnboxed) return null;

  const status = String(row.workflow_status || 'EXPECTED');
  const expected = Math.max(1, Math.floor(Number(row.quantity_expected ?? 1)) || 1);
  const received = Math.max(0, Math.floor(Number(row.quantity_received ?? 0)) || 0);
  if (status === 'DONE' && received >= expected) {
    return { receivingLineId, receivingId: Number(row.receiving_id), received: false };
  }

  const unitsToAdd = Math.max(0, expected - received);
  await deps.receiveLineUnits({
    organizationId: orgId,
    receiving_line_id: receivingLineId,
    units: unitsToAdd,
    serials: [],
    set_workflow_status: 'DONE',
    advanceOnly: true,
    station: 'RECEIVING',
    client_event_id: `inbound-unboxed-receive:${receivingLineId}`,
  });

  return { receivingLineId, receivingId: Number(row.receiving_id), received: true };
}
