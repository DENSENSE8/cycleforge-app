import 'server-only';

/**
 * What a counter tablet OPENS with, resolved at request time: the command it
 * lands on and the org's comp / void reason lists.
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
 * Schemas: `organizations.settings.kiosk.{defaultCommand,compReasons}`
 * and `organizations.settings.brand.primaryColor`, read-only.
 */

import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import { DEFAULT_LINE_REASONS, type KioskLineReasons } from '@/lib/kiosk/price-approval-kinds';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { resolveKioskOrgForRequest } from '@/lib/kiosk/kiosk-request-org.server';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getKioskDefaultCommand, getKioskLineReasons } from '@/lib/tenancy/settings';

export interface CounterBoot {
  defaultCommand: KioskCommandId;
  lineReasons: KioskLineReasons;
  /**
   * The org's brand colour (`settings.brand.primaryColor`, hex-validated by
   * the settings schema) — the counter mode's `--mode-brand`. Null ⇒ the
   * registry default (`MODE_REGISTRY.counter.brand`).
   */
  brandColor: string | null;
}

const FALLBACK_BOOT: CounterBoot = {
  defaultCommand: KIOSK_FALLBACK_COMMAND,
  lineReasons: DEFAULT_LINE_REASONS,
  brandColor: null,
};

export async function resolveCounterBoot(): Promise<CounterBoot> {
  try {
    const orgId = await resolveKioskOrgForRequest();
    if (!orgId) return FALLBACK_BOOT;
    const org = await getOrganization(orgId);
    return {
      defaultCommand: getKioskDefaultCommand(org?.settings),
      lineReasons: getKioskLineReasons(org?.settings),
      brandColor: org?.settings.brand.primaryColor ?? null,
    };
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.warn('resolveCounterBoot failed; opening on the fallbacks', error);
    return FALLBACK_BOOT;
  }
}
