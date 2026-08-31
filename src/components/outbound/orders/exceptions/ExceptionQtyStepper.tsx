'use client';

/**
 * Order quantity — a stepper, not a text field.
 *
 * Operator 2026-08-31: quantity "only should have a stepper up and down for
 * mouse and arrow keys". It was a plain `<Input>` holding a string, which meant
 * an order quantity could be saved as `1O`, `two`, or empty, and the only way
 * to change it was to select the digit and retype.
 *
 * Composed from the house pieces the FBA steppers use — {@link DeferredQtyInput}
 * (the numeric input SoT: draft-while-typing, clamp-and-commit on blur/Enter)
 * plus {@link IconButton} for the two faces — rather than a third copy of that
 * JSX. `FbaQtyStepper` stacks its buttons around a wide cell for a card; this
 * is a FIELD, so the pair sits on the trailing edge at
 * {@link triagePanelControl} height, like every native spinner.
 *
 * Both input methods the operator asked for come free of the `type="number"`
 * underneath: ↑/↓ step it while focused, and the two buttons are the mouse. The
 * native spinner is hidden because it only appears on hover and is unusably
 * small — these faces are always visible and are a real hit target.
 */

import { ChevronDown, ChevronUp } from '@/components/Icons';
import { DeferredQtyInput, IconButton } from '@/design-system/primitives';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** An order line of more than this is a data-entry slip, not a real order. */
const ORDER_QTY_MAX = 999;
const ORDER_QTY_MIN = 1;

export function ExceptionQtyStepper({
  value,
  onChange,
  id,
  'data-testid': testId,
}: {
  /** The order's quantity column — a string, because that is what `orders` holds. */
  value: string;
  onChange: (next: string) => void;
  id?: string;
  'data-testid'?: string;
}) {
  const parsed = Number(value);
  const qty = Number.isFinite(parsed) && parsed >= ORDER_QTY_MIN ? Math.floor(parsed) : 1;

  const set = (next: number) =>
    onChange(String(Math.max(ORDER_QTY_MIN, Math.min(ORDER_QTY_MAX, next))));

  return (
    <div
      className={cn(
        'flex w-28 items-stretch border border-border-soft bg-surface-card',
        triagePanelControl(),
        focusRing('control'),
      )}
      data-testid={testId}
    >
      <DeferredQtyInput
        id={id}
        value={qty}
        min={ORDER_QTY_MIN}
        max={ORDER_QTY_MAX}
        onChange={(v) => set(v)}
        className={cn(
          'min-w-0 flex-1 bg-transparent px-3 text-role-caption font-semibold tabular-nums',
          'text-text-default outline-none',
          // Hide the native spinner: it is hover-only and a two-pixel target.
          // The buttons beside it are the always-visible replacement.
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
          '[&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      {/* One column, two half-height faces — the spinner shape, at a size a
          gloved hand can hit. */}
      <div className="flex shrink-0 flex-col border-l border-border-soft">
        <IconButton
          type="button"
          icon={<ChevronUp className="h-3 w-3" />}
          ariaLabel="Increase quantity"
          // ds-allow-control-size — a spinner face is half the field's height by
          // definition; no rung on the control-size ladder is "half of my
          // parent", so the box is genuinely bespoke here.
          onClick={() => set(qty + 1)}
          disabled={qty >= ORDER_QTY_MAX}
          className="flex h-1/2 w-7 items-center justify-center text-text-soft hover:bg-surface-hover"
        />
        <IconButton
          type="button"
          icon={<ChevronDown className="h-3 w-3" />}
          ariaLabel="Decrease quantity"
          // ds-allow-control-size — see the increase face above.
          onClick={() => set(qty - 1)}
          disabled={qty <= ORDER_QTY_MIN}
          className="flex h-1/2 w-7 items-center justify-center border-t border-border-soft text-text-soft hover:bg-surface-hover"
        />
      </div>
    </div>
  );
}
