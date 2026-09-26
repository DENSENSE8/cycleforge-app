'use client';

/**
 * KioskAmountKeypad — Square's Keypad on the counter tablet:
 * (operator 2026-09-24: "blocky zero corner radius for the buttons edge to
 * field every visit fills (operator 2026-09-24: "typing a phone number in
 */

import { useRef, type KeyboardEvent } from 'react';
import { Button } from '@/design-system/primitives';
import { formatCartCents } from '@/lib/kiosk/cart-card-view';
import {
  KEYPAD_KEYS,
  keypadKeyFromKeyboard,
  pressKeypad,
  type KeypadPress,
} from '@/lib/kiosk/keypad';
import { cn } from '@/utils/_cn';

const KEY_CLASS = 'h-16 text-2xl font-semibold tabular-nums';
const SLAB_KEY_CLASS = 'h-20 w-full text-2xl font-normal tabular-nums text-text-default border-border-hairline';
/** Phone keys share the pane with the contact form (the dock), so they run one notch shorter. */
const PHONE_KEY_CLASS = 'h-16 w-full text-2xl font-normal tabular-nums text-text-default border-border-hairline';
const SLAB_SHAPE = { variant: 'ghost', radius: 'flush' } as const;

/**
 * Slab seams for a 3 × 4 grid: every key but the last column draws its right
 * edge, every key but the last row its bottom edge; the wrapper's border
 * closes the outside.
 */
function slabSeams(index: number): string {
  return cn(index % 3 !== 2 && 'border-r', index < KEYPAD_KEYS.length - 3 && 'border-b');
}

export function KioskAmountKeypad({
  cents,
  onChange,
  onAdd,
  label = 'Amount',
  slab = false,
  className,
}: {
  cents: number;
  onChange: (cents: number) => void;
  /** The `+` key: commit the amount on display. Omitted → no `+` key. */
  onAdd?: () => void;
  label?: string;
  /** Square's Keypad look: one bounded, gapless block of square keys. */
  slab?: boolean;
  className?: string;
}) {
  // Two taps inside one React batch must both land: read the amount the LAST
  // press produced, not the one this render was painted with.
  const latest = useRef(cents);
  latest.current = cents;
  const press = (key: KeypadPress) => {
    const next = pressKeypad(latest.current, key);
    latest.current = next;
    onChange(next);
  };
  const add = () => {
    if (latest.current <= 0) return;
    onAdd?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = keypadKeyFromKeyboard(event.key);
    if (!key || (key === '+' && !onAdd)) return;
    event.preventDefault();
    if (key === '+') add();
    else press(key);
  };

  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn('flex flex-col outline-none', slab ? 'mx-auto w-full max-w-sm gap-6' : 'gap-4', className)}
      data-testid="kiosk-amount-keypad"
    >
      <output
        aria-live="polite"
        className="block text-center text-5xl font-bold tracking-tight tabular-nums text-text-success"
        data-testid="kiosk-amount-display"
      >
        {formatCartCents(cents)}
      </output>
      <div className={cn('grid grid-cols-3', slab ? 'border border-border-hairline' : 'gap-2')}>
        {KEYPAD_KEYS.map((key, index) => {
          const keyClass = slab ? cn(SLAB_KEY_CLASS, slabSeams(index)) : KEY_CLASS;
          const shape = slab ? SLAB_SHAPE : null;
          if (key === '+') {
            return onAdd ? (
              <Button
                key={key}
                size="lg"
                {...shape}
                className={keyClass}
                aria-label="Add amount to sale"
                disabled={cents <= 0}
                onClick={add}
                data-testid="kiosk-keypad-add"
              >
                +
              </Button>
            ) : (
              <span key={key} aria-hidden />
            );
          }
          return (
            <Button
              key={key}
              variant="secondary"
              size="lg"
              {...shape}
              className={keyClass}
              aria-label={key === 'C' ? 'Clear amount' : undefined}
              onClick={() => press(key)}
              data-testid={`kiosk-keypad-${key}`}
            >
              {key}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

const PHONE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'] as const;
export type PhoneKeypadPress = (typeof PHONE_KEYS)[number];

/**
 * The phone slab. Stateless: the caller owns the number (it lives on the
 * session or the pane draft) and applies each press. No focus of its own — the
 * phone input it types for takes a desk keyboard's digits natively.
 */
export function KioskPhoneKeypad({
  onPress,
  className,
}: {
  onPress: (key: PhoneKeypadPress) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Phone keypad"
      className={cn('grid grid-cols-3 border border-border-hairline', className)}
      data-testid="kiosk-phone-keypad"
    >
      {PHONE_KEYS.map((key, index) => (
        <Button
          key={key}
          type="button"
          size="lg"
          {...SLAB_SHAPE}
          className={cn(PHONE_KEY_CLASS, slabSeams(index))}
          aria-label={key === 'C' ? 'Clear phone number' : key === 'back' ? 'Delete last digit' : undefined}
          onClick={() => onPress(key)}
          data-testid={`kiosk-phone-key-${key}`}
        >
          {key === 'back' ? '⌫' : key}
        </Button>
      ))}
    </div>
  );
}
