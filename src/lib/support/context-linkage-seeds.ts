import type { OrgId } from '@/lib/tenancy/constants';
import type { tenantQuery } from '@/lib/tenancy/db';
import type { fetchSerialsForLines } from '@/lib/receiving/serial-projection';
import type { listTicketShipmentReferences } from '@/lib/support/ticket-link';

interface TicketShipmentSeedDeps {
  listReferences: typeof listTicketShipmentReferences;
}

export async function loadTicketShipmentSeed(
  orgId: OrgId,
  ticketId: number,
  currentTracking: string | null,
  deps: TicketShipmentSeedDeps,
): Promise<{ tracking: string | null; shipmentIds: number[] }> {
  const references = await deps.listReferences({ orgId, ticketId });
  const seed = references.find((reference) => reference.isPrimary) ?? references[0];
  return {
    tracking: currentTracking ?? seed?.trackingNumber ?? null,
    shipmentIds: references
      .map((reference) => Number(reference.shipmentId))
      .filter((id) => Number.isFinite(id) && id > 0),
  };
}

export interface SupportSerialSeedDeps {
  query: typeof tenantQuery;
  fetchSerials: typeof fetchSerialsForLines;
}

export async function loadSupportContextSerialSeed(
  orgId: OrgId,
  anchor: { lineId: number | null; receivingId: number | null },
  deps: SupportSerialSeedDeps,
): Promise<string | null> {
  let lineIds =
    anchor.lineId != null && Number.isFinite(anchor.lineId) && anchor.lineId > 0
      ? [anchor.lineId]
      : [];
  if (lineIds.length === 0 && anchor.receivingId != null) {
    const lines = await deps.query<{ id: number }>(
      orgId,
      `SELECT id FROM receiving_line
        WHERE receiving_id = $1 AND organization_id = $2
        ORDER BY id ASC`,
      [anchor.receivingId, orgId],
    );
    lineIds = lines.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  }
  if (lineIds.length === 0) return null;

  const grouped = await deps.fetchSerials(lineIds, orgId);
  for (const lineId of lineIds) {
    const serial = grouped.get(lineId)?.find((entry) => entry.serial_number.trim());
    if (serial) return serial.serial_number.trim();
  }
  return null;
}
