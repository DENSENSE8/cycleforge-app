/**
 * Drop one serial off an ORDER, whichever scan session added it (the phone pick's inline Undo /
 * Replace, owner 2026-10-08). The desk's own `desk/serial remove | update` only reaches serials of
 * its current session anchor, so a serial saved on an earlier visit could be seen but never taken
 * back. Same reversal as the desk: the serial's desk pick goes back to ALLOCATED
 * (`revertDeskSerialPick`), its SERIAL_ADDED activity and its `tech_serial_numbers` row go, and the
 * order's pick facts are re-stated. Idempotent: a serial already gone answers `removed: false`.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { normalizeTechSerial } from '@/lib/tech/insertTechSerialForSalContext';
import { mergeSerialsFromTsnRows } from '@/lib/tech/serialFields';
import { revertDeskSerialPick, type RevertedUnitPick } from '@/lib/picking/unpick';

export type RemoveOrderSerialResult =
  | { kind: 'not_found' }
  | { kind: 'ok'; removed: boolean; serialNumbers: string[]; unpicked: RevertedUnitPick[] };

export async function removeOrderSerial(
  orgId: OrgId,
  input: { orderId: number; serial: string; actorStaffId: number | null },
): Promise<RemoveOrderSerialResult> {
  const serial = normalizeTechSerial(input.serial);
  return withTenantTransaction(orgId, async (client) => {
    const order = await client.query<{ id: number; shipment_id: number | null }>(
      'SELECT id, shipment_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [input.orderId, orgId],
    );
    const row = order.rows[0];
    if (!row) return { kind: 'not_found' } as const;

    const rows = await client.query<{ id: number; serial_number: string }>(
      `SELECT id, serial_number FROM tech_serial_numbers
        WHERE order_id = $1 AND organization_id = $2 AND UPPER(TRIM(serial_number)) = $3
        ORDER BY id`,
      [row.id, orgId, serial],
    );

    const unpicked: RevertedUnitPick[] = [];
    if (rows.rows.length > 0) {
      const reverted = await revertDeskSerialPick(client, orgId, {
        serial,
        orderId: row.id,
        shipmentId: row.shipment_id,
        actorStaffId: input.actorStaffId,
        source: 'pick.phone.remove',
      });
      if (reverted) unpicked.push(reverted);
      const ids = rows.rows.map((r) => r.id);
      await client.query(
        `DELETE FROM station_activity_logs
          WHERE tech_serial_number_id = ANY($1::int[]) AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
        [ids, orgId],
      );
      await client.query('DELETE FROM tech_serial_numbers WHERE id = ANY($1::int[]) AND organization_id = $2', [ids, orgId]);
      await refreshOrderStageFacts(orgId, { orderIds: [row.id], shipmentIds: [row.shipment_id] }, client);
    }

    const remaining = await client.query<{ serial_number: string | null }>(
      'SELECT serial_number FROM tech_serial_numbers WHERE order_id = $1 AND organization_id = $2 ORDER BY id',
      [row.id, orgId],
    );
    return { kind: 'ok', removed: rows.rows.length > 0, serialNumbers: mergeSerialsFromTsnRows(remaining.rows), unpicked } as const;
  });
}
