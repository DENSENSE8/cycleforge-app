'use client';

/**
 * KioskCartLineCard — one cart line as a TOUCH card.
 *
 * Replaces `CompoundRow` on the kiosk cart. That row is the desk compound
 * table (Unbox / Incoming / To-Ship / Tasks share it): a 7-track CSS grid with
 * a select gutter, a dots menu and desk-micro type. On a counter tablet it read
 * as a spreadsheet stretched across the glass — operator 2026-09-14, of the
 * cart panel: *"This is a wrong display. It should display a mobile-like chip
 * display component with a rounded corner radius and kind of pills and
 * buttons."* `SURFACE_LAW` §5 already says it: lists on a phone-shaped surface
 * are cards, never a DataTable.
 *
 * So: a rounded row card (`MOBILE_SCAN_ROW_CORNER`, the same corner the mobile
 * scan rows wear), the title on top, then {@link KioskChip} meta chips on the
 * left of the last line with `qty · amount` at its right edge (the amount
 * alone when the stepper already shows the quantity). The card IS the
 * edit affordance — tap to correct, the gesture the row had. Void stays on the
 * swipe wrapper.
 *
 * A SALE line also carries `−  N  +` on that last row (Square's cart stepper,
 * brought onto the card: on a counter tablet the extra item-details screen is
 * the cost being removed). `−` at 1 asks first by swapping the row to
 * `Keep` / `Remove` in place — never a modal over the work.
 *
 * FLAT (2026-09-15). This carried `elevationClass('raised','soft')` per line,
 * which was a soft lift on a white card sitting on a white sheet — depth you
 * could not see doing the job a hairline already does. The sheet it sits on was
 * de-shadowed the same day (operator: *"it should not display a depth drop
 * shadow"*), and a blur inside it would be that same popover cue one altitude
 * down. Separation is `border-border-hairline` plus the sunken stage behind the
 * sheet — planes, never blur.
 *
 * Callers: `KioskCartLedger`, `KioskKeypadFace`, `KioskCustomerFace`. Affected API: none.
 * Schemas: `counter_session_lines` via {@link cartLineCardView}.
 */

import { useState } from 'react';
import { Wrench, SalesPrice, RefreshCw } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KioskQuantityStepper, KioskRemoveConfirm } from '@/components/kiosk/KioskQuantityStepper';
import { cartLineCardView, stepCartQuantity } from '@/lib/kiosk/cart-card-view';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

/**
 * Line-type glyph + ink, matching the command on the mode selector
 * (`KioskServiceTile.icon` / `iconTone`): repair amber, sale green, trade-in
 * blue. A chip states its kind with a glyph AND a colour, never colour alone.
 * A sale wears the Sales mode's own tag glyph — not the shopping cart, which
 * is the header's Cart key and would read as "open the cart" on every line.
 */
const TYPE_FACE = {
  REPAIR: { Icon: Wrench, tone: 'warning' as const },
  BUYBACK: { Icon: RefreshCw, tone: 'info' as const },
  RETAIL: { Icon: SalesPrice, tone: 'success' as const },
};

export function KioskCartLineCard({
  line,
  voided = false,
  open = false,
  onOpen,
  onQuantityChange,
  onRemove,
  readOnly = false,
}: {
  line: KioskCartLine;
  /** `counter_session_lines.voided_at` is set — struck, not gone. */
  voided?: boolean;
  /** This line's editor is showing. */
  open?: boolean;
  onOpen?: () => void;
  /** Sale lines: the `−` / `+` stepper writes the new quantity here. */
  onQuantityChange?: (quantity: number) => void;
  /**
   * `−` at 1 removes after a confirm. Omitted on a desk-held mirror, where a
   * remove is a staff void the tablet may not make; `−` then stops at 1.
   */
  onRemove?: () => void;
  /**
   * Customer-facing mount: the same card, no verb. The customer's screen
   * states the line; it never edits it (that is the staff face's job), so the
   * card must not claim a button role it cannot honour.
   */
  readOnly?: boolean;
}) {
  const view = cartLineCardView(line, { voided });
  const face = TYPE_FACE[line.type === 'REPAIR' ? 'REPAIR' : line.type === 'BUYBACK' ? 'BUYBACK' : 'RETAIL'];
  const TypeIcon = face.Icon;
  const interactive = !readOnly && typeof onOpen === 'function';
  const stepper = interactive && view.steppable && typeof onQuantityChange === 'function';
  const [confirmRemove, setConfirmRemove] = useState(false);

  const step = (delta: 1 | -1) => {
    const next = stepCartQuantity(line.quantity, delta);
    if (next.kind === 'confirm-remove') {
      if (onRemove) setConfirmRemove(true);
      return;
    }
    onQuantityChange?.(next.quantity);
  };

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? open : undefined}
      aria-label={interactive ? `Cart line ${view.title}` : undefined}
      data-cart-line-id={line.id}
      data-testid="kiosk-cart-line"
      onClick={interactive ? onOpen : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={cn(
        'flex w-full flex-col gap-2 border border-border-hairline bg-surface-card px-4 py-3 text-left',
        MOBILE_SCAN_ROW_CORNER,
        // No elevation here; see the FLAT note in the docblock.
        interactive && 'cursor-pointer transition-colors hover:bg-surface-hover',
        open && 'bg-surface-accent',
      )}
    >
      <span
        className={cn(
          'min-w-0 truncate text-sm font-semibold text-text-default',
          view.voided && 'line-through text-text-soft',
        )}
      >
        {view.title}
      </span>

      {view.detail ? (
        <p className={cn('truncate', KIOSK_META)}>{view.detail}</p>
      ) : null}

      {/* FACTS left, MONEY right, on the card's last line — the list rule
          (operator 2026-09-23): in a list, money sits on the right edge so
          the eye can run down one column of figures, and ONLY the money wears
          the money token; the quantity is black, `text-text-default` (operator
          2026-09-24: "the number … right next to the price must be black not
          green"). A stepper line's `−  N  +` IS its
          quantity, so the right edge prints the total alone — never N twice. */}
      {confirmRemove ? (
        <KioskRemoveConfirm
          testIdPrefix="kiosk-cart-line"
          onKeep={() => setConfirmRemove(false)}
          onRemove={() => {
            setConfirmRemove(false);
            onRemove?.();
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <KioskChip
              tone={view.voided ? 'danger' : face.tone}
              icon={<TypeIcon className="h-3.5 w-3.5" />}
            >
              {view.stateLabel}
            </KioskChip>
            {view.compReason ? (
              <KioskChip testId="kiosk-cart-line-comp-reason">{view.compReason}</KioskChip>
            ) : null}
            {view.custom ? <KioskChip testId="kiosk-cart-line-custom">Custom</KioskChip> : null}
            {[view.primaryId, view.secondaryId].map((fact) =>
              fact ? (
                <KioskChip key={fact.label}>
                  <span className="font-normal">{fact.label}</span> {fact.value}
                </KioskChip>
              ) : null,
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {stepper ? (
              <KioskQuantityStepper
                title={view.title}
                quantity={view.quantity}
                onStep={step}
                canRemove={Boolean(onRemove)}
                testIdPrefix="kiosk-cart-line"
              />
            ) : null}
            {view.adjustedFrom ? (
              // The catalog price, struck — the amount beside it is what the
              // customer pays (Square shows the same on an adjusted item).
              <s
                className="text-sm tabular-nums text-text-soft"
                aria-label={`was ${view.adjustedFrom}`}
                data-testid="kiosk-cart-line-adjusted-from"
              >
                {view.adjustedFrom}
              </s>
            ) : null}
            <span className="flex items-baseline gap-1 text-base font-semibold tabular-nums">
              {stepper ? null : (
                <span
                  className={cn('text-text-default', view.voided && 'line-through text-text-soft')}
                  data-testid="kiosk-cart-line-qty-prefix"
                >
                  {view.quantity} ·
                </span>
              )}
              <span
                className={cn('text-text-success', view.voided && 'line-through text-text-soft')}
                data-testid="kiosk-cart-line-amount"
              >
                {view.amount}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
