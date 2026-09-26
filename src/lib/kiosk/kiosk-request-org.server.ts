import 'server-only';

/** The paired tablet's org for THIS request — one device lookup per render. */

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
