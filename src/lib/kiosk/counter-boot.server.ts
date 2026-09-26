import 'server-only';

/**
 * What a counter tablet OPENS with, resolved at request time:
 * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to sales.
 */

import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import { DEFAULT_LINE_REASONS, type KioskLineReasons } from '@/lib/kiosk/price-approval-kinds';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { resolveKioskOrgForRequest } from '@/lib/kiosk/kiosk-request-org.server';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getKioskDefaultCommand, getKioskLineReasons } from '@/lib/tenancy/settings';

interface CounterBoot {
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
