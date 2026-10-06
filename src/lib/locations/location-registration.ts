/**
 * Registering printer-format addresses as live location rows, with the
 * BIN_CREATE audit floor. `POST /api/locations/register` (label printers,
 * station forms) and the scan verify route (first scan of a new sticker) both
 * write through here, under the same `print.label` permission.
 */

import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { registerPrintedLocations, type PrintedLocationsRegistration } from '@/lib/neon/location-queries';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { AuthContext } from '@/lib/auth/auth-context';
import type { LocationSegments } from '@/lib/barcode-routing';

/** The permission every location registration requires. */
export const LOCATION_REGISTER_PERMISSION = 'print.label';

export type LocationRegistration = {
  room: string;
  segments: LocationSegments[];
  binType?: string | null;
  capacity?: number | null;
};

export async function registerLocationsAudited(
  req: NextRequest,
  ctx: AuthContext,
  input: LocationRegistration,
): Promise<PrintedLocationsRegistration> {
  const result = await registerPrintedLocations(input, ctx.organizationId);

  // Audit floor — log only when we actually inserted/reactivated rows
  // (re-prints of existing live bins are silent).
  if (result.registered > 0) {
    await recordAudit(pool, ctx, req, {
      source: 'inventory.label.register',
      action: AUDIT_ACTION.BIN_CREATE,
      entityType: AUDIT_ENTITY.BIN,
      entityId: result.bins.map((b) => b.id).join(','),
      after: {
        room: input.room,
        registered: result.registered,
        barcodes: result.bins.map((b) => b.barcode).filter(Boolean),
      },
    });
  }
  return result;
}
