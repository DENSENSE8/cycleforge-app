import 'server-only';

/**
 * Which command a counter tablet OPENS on, resolved at request time.
 *
 * ## Why this is server-side and not a fetch
 *
 * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to sales.
 * It must default to repair service."* The store seeded `'retail'` while
 * `/kiosk/v2/page.tsx` already seeded the REPAIR catalog rail and documented
 * repair as the default — so the tablet painted a repair first frame and then
 * booted into Sales. The fix has to land BEFORE first paint, which rules out
 * the obvious `/api/kiosk/settings` fetch: that is a waterfall, and its reward
 * is a visible flash of the wrong command on every page load.
 *
 * `/kiosk/v2` is already `force-dynamic` and already resolves this tablet's org
 * from the device cookie for the catalog seed, so the org's choice comes down
 * in the same request as the HTML.
 *
 * ## Posture: never break a counter
 *
 * Same contract as `seedKioskCatalog` — an unpaired tablet, a DB hiccup or a
 * hand-edited settings bag returns {@link KIOSK_FALLBACK_COMMAND} rather than
 * throwing. A tablet that cannot open because a preference could not be read
 * is strictly worse than one that opens on repair.
 *
 * The ONE exception is Next's dynamic-usage signal. Measured 2026-09-15 on the
 * catalog seed: swallowing it made the build conclude `/kiosk/v2` was static
 * and `next start` then served a prerender forever. `isNextDynamicUsage` is
 * that guard, shared rather than re-derived.
 *
 * Callers: `/kiosk/v2/page.tsx`. Affected API: none.
 * Schemas: `organizations.settings.kiosk.defaultCommand`, read-only.
 */

import { cookies } from 'next/headers';
import { KIOSK_COOKIE_NAME, loadKioskDeviceByToken } from '@/lib/auth/kiosk-device';
import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getKioskDefaultCommand } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';

/** The paired tablet's org, or null when this device is not bound. */
async function resolveOrgFromCookie(): Promise<OrgId | null> {
  const token = (await cookies()).get(KIOSK_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  const device = await loadKioskDeviceByToken(token);
  return (device?.organizationId as OrgId | undefined) ?? null;
}

export async function resolveCounterDefaultCommand(): Promise<KioskCommandId> {
  try {
    const orgId = await resolveOrgFromCookie();
    if (!orgId) return KIOSK_FALLBACK_COMMAND;
    const org = await getOrganization(orgId);
    return getKioskDefaultCommand(org?.settings);
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.warn('resolveCounterDefaultCommand failed; opening on the fallback', error);
    return KIOSK_FALLBACK_COMMAND;
  }
}
