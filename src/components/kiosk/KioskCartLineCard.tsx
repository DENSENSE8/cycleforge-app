'use client';

/**
 * KioskCartLineCard — one cart line as a TOUCH card.
 * as a spreadsheet stretched across the glass — operator 2026-09-14, of the
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

/** Line-type glyph + ink, matching the command on the mode selector (`KioskServiceTile.icon` / `iconTone`): */
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

      {/*
 * FACTS left, MONEY right, on the card's last line — the list rule
 * (operator 2026-09-23): in a list, money sits on the right edge so
 */}
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
