'use client';

/**
 * Local-pickup sidebar — the staged-cart picker for the Local Pickup job.
 *
 * A thin adapter over {@link WalkInCartSidebar}: this file owns only what is
 * pickup-specific — dollar-string money, the condition + parts-state trailing
 * cells, and the review/finalize submit. Clicking a row points the shared
 * store's `selectedKey` at it, which drives the main-pane editor
 * (`LocalPickupEditPanel`). Adding happens in the main pane's Add display, so
 * this panel is pure list + submit (no inline editing).
 */

import { Check, ShoppingCart } from '@/components/Icons';
import { getSidebarIntakeSubmitButtonClass } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { WalkInCartRow, WalkInCartSidebar } from '@/components/walk-in/WalkInCartSidebar';
import {
  conditionLabel,
  formatMoney,
  openReview,
  parseMoney,
  selectLine,
  useLocalPickupCart,
} from './localPickupStore';

export function LocalPickupSidebarList() {
  const { cart, selectedKey, submitError, successMessage } = useLocalPickupCart();

  const subtotal = cart.reduce((sum, l) => sum + parseMoney(l.total), 0);
  const unitCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <WalkInCartSidebar
      eyebrow="Walk-In"
      title="Local Pickup"
      isEmpty={cart.length === 0}
      subtotal={cart.length > 0 ? formatMoney(subtotal) : null}
      error={submitError}
      footer={
        successMessage ? (
          <div
            role="status"
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 text-role-caption font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200"
          >
            <Check className="h-4 w-4" />
            {successMessage}
          </div>
        ) : (
          <Button
            type="button"
            onClick={() => openReview()}
            disabled={cart.length === 0}
            icon={<ShoppingCart />}
            className={`w-full ${getSidebarIntakeSubmitButtonClass('green')}`}
          >
            {cart.length > 0
              ? `Review ${unitCount} Item${unitCount === 1 ? '' : 's'}`
              : 'No items to review'}
          </Button>
        )
      }
    >
      {cart.map((line) => (
        <WalkInCartRow
          key={line.key}
          imageUrl={line.image_url}
          title={line.product_title}
          price={line.total ? `$${line.total}` : '$0'}
          quantity={line.quantity}
          active={line.key === selectedKey}
          onSelect={() => selectLine(line.key)}
          meta={
            <>
              <span className="font-black text-text-soft">
                {conditionLabel(line.conditionGrade)}
              </span>
              <span
                className={`ml-auto font-black ${
                  line.partsStatus === 'MISSING_PARTS'
                    ? 'text-amber-500'
                    : 'text-emerald-600'
                }`}
              >
                {line.partsStatus === 'MISSING_PARTS' ? 'Missing' : 'Complete'}
              </span>
            </>
          }
        />
      ))}
    </WalkInCartSidebar>
  );
}
