import 'server-only';

/**
 * The paired tablet's org for THIS request — one device lookup per render.
 *
 * The kiosk page resolves two server facts in parallel (the catalog seed and
 * the counter boot), and each used to run its own `loadKioskDeviceByToken`:
 * two identical owner-pool SELECTs plus two `last_seen_at` UPDATEs on every
 * page load. React `cache()` scopes the memo to one server request, so the
 * second caller awaits the first's promise instead of a second round trip.
 *
 * Callers: `seed-catalog.server.ts`, `counter-boot.server.ts`.
 * Affected API: none. Schemas: `kiosk_devices` (read + advisory touch).
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { KIOSK_COOKIE_NAME, loadKioskDeviceByToken } from '@/lib/auth/kiosk-device';
import type { OrgId } from '@/lib/tenancy/constants';

export const resolveKioskOrgForRequest = cache(async (): Promise<OrgId | null> => {
  const token = (await cookies()).get(KIOSK_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  const device = await loadKioskDeviceByToken(token);
  return (device?.organizationId as OrgId | undefined) ?? null;
});
