'use client';

/**
 * Walk-in sales sidebar — the staged-cart picker for the Sales job.
 *
 * A thin adapter over {@link WalkInCartSidebar}: this file owns only what is
 * sales-specific — Square money formatting, the SKU/Manual trailing cell, and
 * the "Charge $X" checkout that dispatches the order to the Square terminal.
 * Clicking a row points the shared store's `selectedKey` at it, which drives
 * the main-pane editor (`SalesEditPanel`). Adding happens in the main pane's
 * popover, so this panel is pure list + checkout (no inline editing).
 */

import { Check, Loader2, ShoppingCart } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { getSidebarIntakeSubmitButtonClass } from '@/design-system/components';
import { formatCentsToDollars } from '@/lib/square/client';
import { WalkInCartRow, WalkInCartSidebar } from './WalkInCartSidebar';
import { checkout, selectLine, useSalesCart } from './salesCartStore';

export function SalesCartSidebar() {
  const { cart, selectedKey, isSubmitting, submitError, successMessage } = useSalesCart();

  const subtotal = cart.reduce((sum, l) => sum + l.unitAmount * l.quantity, 0);
  const canSubmit = cart.length > 0 && !isSubmitting;

  return (
    <WalkInCartSidebar
      eyebrow="Walk-In Sale"
      title="New Sale"
      isEmpty={cart.length === 0}
      subtotal={cart.length > 0 ? formatCentsToDollars(subtotal) : null}
      error={submitError}
      footer={
        <Button
          type="button"
          onClick={() => void checkout()}
          disabled={!canSubmit}
          icon={
            isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : successMessage ? (
              <Check />
            ) : (
              <ShoppingCart />
            )
          }
          className={`w-full ${getSidebarIntakeSubmitButtonClass('green')}`}
        >
          {isSubmitting
            ? 'Sending…'
            : successMessage
              ? successMessage
              : cart.length > 0
                ? `Charge ${formatCentsToDollars(subtotal)}`
                : 'Add Products'}
        </Button>
      }
    >
      {cart.map((line) => (
        <WalkInCartRow
          key={line.key}
          imageUrl={line.image_url}
          title={line.product_title}
          price={formatCentsToDollars(line.unitAmount * line.quantity)}
          quantity={line.quantity}
          active={line.key === selectedKey}
          onSelect={() => selectLine(line.key)}
          meta={
            line.sku ? (
              <span className="ml-auto min-w-0 truncate font-black text-text-faint">
                {line.sku}
              </span>
            ) : line.isManual ? (
              <span className="ml-auto font-black text-text-faint">Manual</span>
            ) : null
          }
        />
      ))}
    </WalkInCartSidebar>
  );
}
