/** Promote lines that already have local receive qty but are stuck at UNBOXED (Zoho sync pending / failed) to DONE so coarse paint reads… */

import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';

export async function promoteLocallyReceivedUnboxedToDone(args: {
  organizationId: OrgId;
  receivingId: number;
  actorStaffId?: number | null;
}): Promise<{ promoted: number }> {
  const orgId = args.organizationId;
  const receivingId = args.receivingId;
  if (!Number.isFinite(receivingId) || receivingId <= 0) return { promoted: 0 };

  let promoted = 0;
  await withTenantTransaction(orgId, async (client) => {
    const res = await client.query<{ id: number }>(
      `SELECT id
         FROM receiving_line
        WHERE organization_id = $1
          AND receiving_id = $2
          AND workflow_status = 'UNBOXED'
          AND COALESCE(quantity_received, 0) > 0
        ORDER BY id`,
      [orgId, receivingId],
    );
    for (const row of res.rows) {
      const tr = await transitionReceivingLine(
        {
          receivingLineId: row.id,
          to: 'DONE',
          expectedFrom: 'UNBOXED',
          actorStaffId: args.actorStaffId ?? null,
          station: 'RECEIVING',
          skipEvent: true,
        },
        client,
        orgId,
      );
      if (tr.ok) promoted += 1;
    }
  });
  return { promoted };
}
