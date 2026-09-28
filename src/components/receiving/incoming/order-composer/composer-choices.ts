'use client';

import { useMemo } from 'react';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { rankInboundPlatformOptions } from '@/lib/inbound/inbound-platform-options';
import {
  filledInboundLines,
  INBOUND_RETURN_REASONS,
  type InboundOrderDraft,
  type InboundOrderLine,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import { formatCurrency } from '@/utils/_number';

export const PRIORITY_AUTO = 'auto';

type ComposerChoice = { value: string; label: string };

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

/** The order-number caption: a PO's own number, a return's original sale, else the platform's words. */
export function orderNumberLabel(type: InboundOrderType, platform: string): string {
  if (type === 'PO') return 'PO / order number';
  if (type === 'RETURN') return 'Original order #';
  if (platform === 'ebay') return 'eBay order #';
  if (platform === 'amazon' || platform === 'fba') return 'Amazon order #';
  if (platform === 'goodwill') return 'Goodwill order / PO #';
  return 'Order / PO #';
}

export const RETURN_REASON_CHOICES: ComposerChoice[] = INBOUND_RETURN_REASONS.map((reason) => ({ value: reason, label: reason }));

/** Money in the order's currency; unknown stays a dash, never a guessed number. */
export function formatInboundMoney(cents: number | null, currency: string): string {
  // Intl throws on a half-typed code — fall back to USD until the field holds three letters.
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
  if (cents != null) return formatCurrency(cents / 100, code);
  return `${formatCurrency(0, code).replace(/[\d.,\s]/g, '')}—`;
}

/** qty × unit cost; null while either is unsaid. */
export function inboundLineTotalCents(line: Pick<InboundOrderLine, 'quantity' | 'unitCostCents'>): number | null {
  return line.quantity == null || line.unitCostCents == null ? null : line.quantity * line.unitCostCents;
}

/** Subtotal of the lines whose cost is known, and how many filled lines lack one. */
export function inboundOrderCostTotal(draft: Pick<InboundOrderDraft, 'lines'>): { subtotalCents: number; missingCost: number } {
  let subtotalCents = 0;
  let missingCost = 0;
  for (const line of filledInboundLines(draft)) {
    const total = inboundLineTotalCents(line);
    if (total == null) missingCost += 1;
    else subtotalCents += total;
  }
  return { subtotalCents, missingCost };
}

/** A typed listing link safe to open — http(s) only, so a pasted `javascript:` never becomes an href. */
export function openableListingUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
