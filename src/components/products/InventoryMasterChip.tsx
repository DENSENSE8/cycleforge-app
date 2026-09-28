'use client';

/**
 * Capability-neutral Inventory master chip.
 * Badge always reads "Inventory"; tooltip / detail escape hatch shows the
 * connected provider noun + external id for dogfood muscle memory.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

export function InventoryMasterChip({
  providerItemId,
  providerLabel,
  className,
}: {
  providerItemId?: string | null;
  /** Runtime provider display label (e.g. "Zoho Inventory"). */
  providerLabel?: string | null;
  className?: string;
}) {
  const tipParts = [
    providerLabel ? `Provider: ${providerLabel}` : null,
    providerItemId ? `ID: ${providerItemId}` : null,
  ].filter(Boolean);
  const tip = tipParts.length > 0 ? tipParts.join(' · ') : 'Inventory master';

  const chip = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-role-eyebrow font-semibold text-red-700',
        className,
      )}
    >
      Inventory
    </span>
  );

  return (
    <HoverTooltip label={tip} asChild focusable={false}>
      {chip}
    </HoverTooltip>
  );
}
