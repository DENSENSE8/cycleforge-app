import 'server-only';

import { sessionIsPhoneExecution } from '@/lib/auth/phone-execution';
import type { DeviceKind } from '@/lib/auth/session';
import { tenantQuery } from '@/lib/tenancy/db';

export async function ownsMobileScanEvent(
  organizationId: string,
  staffId: number,
  mobileScanEventId: number | null,
): Promise<boolean> {
  if (mobileScanEventId == null || !Number.isSafeInteger(mobileScanEventId) || mobileScanEventId <= 0) {
    return false;
  }
  const found = await tenantQuery<{ id: number }>(
    organizationId,
    `SELECT id
       FROM mobile_scan_events
      WHERE id = $1
        AND organization_id = $2
        AND staff_id = $3
      LIMIT 1`,
    [mobileScanEventId, organizationId, staffId],
  );
  return found.rows.length > 0;
}

/**
 * A commit is phone-origin only from a server-trusted anchor:
 * the session row (phone door, or a phone user agent stored at sign-in),
 * or a resolver row this staff already owns.
 */
export async function commitIsPhoneOrigin(input: {
  session: { deviceKind: DeviceKind | string; userAgent: string | null };
  organizationId: string;
  staffId: number;
  mobileScanEventId: number | null;
}): Promise<boolean> {
  if (sessionIsPhoneExecution(input.session)) return true;
  return ownsMobileScanEvent(input.organizationId, input.staffId, input.mobileScanEventId);
}
