'use client';

import { useMemo } from 'react';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { rankInboundPlatformOptions } from '@/lib/inbound/inbound-platform-options';

export const PRIORITY_AUTO = 'auto';

export type ComposerChoice = { value: string; label: string };

/** Org platform catalog, inbound-intake order. */
export function usePlatformChoices(): ComposerChoice[] {
  const catalog = usePlatformCatalog();
  return useMemo(
    () => rankInboundPlatformOptions(catalog.options ?? []).map(({ value, label }) => ({ value, label })),
    [catalog.options],
  );
}

/** Auto (the platform's default tier) first, then the manual override tiers. */
export function usePriorityChoices(): ComposerChoice[] {
  return useMemo(
    () => [
      { value: PRIORITY_AUTO, label: 'Auto — follows platform' },
      ...priorityOverrideTiersForPicker().map((tier) => ({ value: String(tier.value), label: tier.label })),
    ],
    [],
  );
}

/** The order-number caption in the platform's own words. */
export function orderNumberLabel(platform: string): string {
  if (platform === 'ebay') return 'eBay order #';
  if (platform === 'amazon' || platform === 'fba') return 'Amazon order #';
  if (platform === 'goodwill') return 'Goodwill order / PO #';
  return 'Order / PO #';
}
