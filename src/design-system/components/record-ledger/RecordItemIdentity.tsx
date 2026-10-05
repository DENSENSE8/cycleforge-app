'use client';

/**
 * An item's identity facts on a desk record (owner 2026-09-29) — the ONE
 * implementation the outbound order record and the inbound receiving record
 * share:
 * - {@link ItemIdentityRow}: label · value · actions on ONE ruler, so SKU and
 *   Item # line up in width and height whatever each one's actions are.
 * - {@link SkuOpenInMenu}: the SKU's links out (products, inventory, stock).
 */

import type { ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { cn } from '@/utils/_cn';

/**
 * One fact of an item (SKU, Item #, condition, qty, cost…) on the record's
 * ruler: a fixed label width, the value, the actions in a fixed slot shown on
 * hover / focus. `wrap` lets a multi-value row (serial chips) grow past one
 * line; every other row is exactly one row tall.
 */
export function ItemIdentityRow({
  label,
  actions,
  testId,
  wrap = false,
  layout = 'ruler',
  children,
}: {
  label: string;
  actions: ReactNode;
  testId?: string;
  wrap?: boolean;
  /** `cell` lets several facts share one responsive identity strip. */
  layout?: 'ruler' | 'cell';
  children: ReactNode;
}) {
  const cell = layout === 'cell';
  return (
    <span
      className={cn(
        'group/identity flex min-w-0 items-center gap-2 border-b border-mode-fact',
        cell && 'relative',
        wrap ? 'min-h-9 py-0.5' : 'h-9',
      )}
      data-testid={testId}
    >
      <span className={cn(RECORD_LABEL_CLASS, cell ? 'w-auto' : 'w-14', 'shrink-0 leading-none text-mode-muted')}>{label}</span>
      <span className={cn('flex min-w-0 flex-1 items-center leading-none', wrap && 'flex-wrap gap-1')}>{children}</span>
      <span
        className={cn(
          'flex shrink-0 items-center justify-end opacity-0 transition-opacity group-focus-within/identity:opacity-100 group-hover/identity:opacity-100',
          cell
            ? 'absolute inset-y-0 right-0 bg-mode-bar pl-1'
            : 'w-auto @sm:w-[5.25rem]',
        )}
      >
        {actions}
      </span>
    </span>
  );
}

/** The item's links out, by SKU — every surface that answers "what about this product?". */
const SKU_DESTINATIONS: readonly { id: string; label: string; href: (sku: string) => string }[] = [
  { id: 'product', label: 'View in products', href: (sku) => `/products/sku/${encodeURIComponent(sku)}` },
  { id: 'inventory', label: 'View in inventory', href: (sku) => `/inventory/health/sku/${encodeURIComponent(sku)}` },
  { id: 'stock', label: 'View stock by bin', href: (sku) => `/inventory/stock?q=${encodeURIComponent(sku)}` },
];

export function SkuOpenInMenu({ sku }: { sku: string }) {
  return (
    <DropdownMenu modal={false}>
      <HoverTooltip label="Open this SKU in…" asChild placement="above">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Open ${sku} in…`}
            data-testid="record-sku-open-in"
            className={cn(
              'ds-raw-button inline-flex size-7 items-center justify-center rounded-mode-control text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
              focusRing('control'),
            )}
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
      </HoverTooltip>
      <DropdownMenuContent align="end" side="bottom">
        {SKU_DESTINATIONS.map((destination) => (
          <DropdownMenuItem key={destination.id} asChild data-testid={`record-sku-open-${destination.id}`}>
            <a href={destination.href(sku)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              {destination.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
