'use client';

/**
 * Kiosk right utility spine — vertical glyph rail at the FAR RIGHT edge.
 *
 * @domain-job Reach every checkout-context panel from one place.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification The left `KioskModeSpine` chooses WHAT the operator is doing
 *   (Repair · Retail · Buyback · Pickup); this chooses WHAT THEY ARE LOOKING AT
 *   about the current checkout (cart, paperwork, …). Same two-state rail
 *   grammar and the same row tokens — one column per axis, never a floating
 *   card over the work.
 *
 * Slots are a registry ({@link KIOSK_UTILITY_SLOTS}) so a later checkout-context
 * panel (payment, ID capture, warranty…) is one entry plus its panel, not new
 * chrome.
 */

import { AlertTriangle, FileText, ShoppingCart } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  KIOSK_CART_COUNT_BADGE,
  KIOSK_MODE_SPINE_ICON,
  KIOSK_MODE_SPINE_ROW_ACTIVE,
  KIOSK_MODE_SPINE_ROW_IDLE,
  KIOSK_UTILITY_SPINE_FACE,
  KIOSK_UTILITY_SPINE_ROW,
} from './kiosk-chrome';

export type KioskUtilitySlotId = 'cart' | 'paperwork' | 'triage';

interface KioskUtilitySlot {
  id: KioskUtilitySlotId;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
}

/** Order is the rail order, top → bottom. Cart is always first. */
export const KIOSK_UTILITY_SLOTS: readonly KioskUtilitySlot[] = [
  // ShoppingCart is the checkout noun. Pickup on the left command spine uses
  // PackageCheck so one glyph never means two things on one screen.
  { id: 'cart', label: 'Cart', Icon: ShoppingCart },
  { id: 'paperwork', label: 'Paperwork', Icon: FileText },
  { id: 'triage', label: 'Triage', Icon: AlertTriangle },
];

export function KioskUtilitySpine({
  activeSlot,
  onSelect,
  cartCount,
  blockerCount,
}: {
  activeSlot: KioskUtilitySlotId | null;
  /** Same id again closes the panel — the glyph is a toggle. */
  onSelect: (next: KioskUtilitySlotId | null) => void;
  cartCount: number;
  /** Open blockers — the Triage glyph carries the same badge grammar as cart. */
  blockerCount: number;
}) {
  return (
    <aside
      className={KIOSK_UTILITY_SPINE_FACE}
      aria-label="Checkout panels"
      data-testid="kiosk-utility-spine"
      data-active-slot={activeSlot ?? 'none'}
    >
      {KIOSK_UTILITY_SLOTS.map(({ id, label, Icon }) => {
        const active = activeSlot === id;
        return (
          <HoverTooltip key={id} label={active ? `Hide ${label}` : label} placement="left">
            <button
              type="button"
              aria-label={label}
              aria-pressed={active}
              data-testid={`kiosk-utility-${id}`}
              onClick={() => onSelect(active ? null : id)}
              className={cn(
                KIOSK_UTILITY_SPINE_ROW,
                active ? KIOSK_MODE_SPINE_ROW_ACTIVE : KIOSK_MODE_SPINE_ROW_IDLE,
              )}
            >
              <Icon className={KIOSK_MODE_SPINE_ICON} />
              {id === 'triage' && blockerCount > 0 && (
                <span
                  className={cn(KIOSK_CART_COUNT_BADGE, 'right-2 top-2 bg-red-600')}
                  data-testid="kiosk-triage-count"
                >
                  {blockerCount}
                </span>
              )}
              {id === 'cart' && cartCount > 0 && (
                <span
                  className={cn(KIOSK_CART_COUNT_BADGE, 'right-2 top-2')}
                  data-testid="kiosk-cart-count"
                >
                  {cartCount}
                </span>
              )}
            </button>
          </HoverTooltip>
        );
      })}
    </aside>
  );
}
