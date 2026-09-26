'use client';

/**
 * KioskEntryField — the ONE text entry control of the kiosk step path, and of
 * every desk flow that wears the kiosk face (desk repair pickup sign-off).
 *
 * Placeholder-in-box, no floating label, no divider, the kiosk's one corner
 * radius. Every input answers to ONE token ({@link KIOSK_POS_ENTRY}), which
 * holds the 16px floor that stops iOS from zooming the whole surface on focus.
 * Accessibility rides an sr-only `<label>` element — the visible prompt is the
 * placeholder.
 *
 * Its own module on purpose: it used to live inside `KioskCustomerIntake`,
 * whose module binds the kiosk session store — so a desk flow that only wanted
 * the field would have imported the counter's cart root to get it. The field
 * is session-free; the intake is not.
 *
 * Callers: `KioskCustomerIntake`, `KioskRepairPane`, `KioskTicketStep`,
 * `KioskReasonStep`, `ReasonSelector`, `RepairPickupFlow`, `KioskSerialListField`.
 * Affected API: none. Schemas: none.
 */

import type { KeyboardEvent, ReactNode } from 'react';
import {
  KIOSK_POS_ENTRY,
  KIOSK_POS_ENTRY_AREA,
  KIOSK_POS_ENTRY_ICON,
  KIOSK_POS_ENTRY_ICON_HOST,
  KIOSK_POS_ENTRY_ICON_INSET,
} from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';

/**
 * `entry` face of {@link KioskCustomerIntake} and every channel extra — the
 * trio and the extras share this control so they can never fork again.
 */
export function KioskEntryField({
  name,
  value,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  multiline = false,
  icon,
  testId,
  idScope,
  onEnter,
  autoFocus,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  /** `none` = the caller renders its own glass keys (the phone keypad). */
  inputMode?: 'text' | 'tel' | 'email' | 'decimal' | 'numeric' | 'none';
  autoComplete?: string;
  maxLength?: number;
  multiline?: boolean;
  /**
   * Leading glyph inside the field — states the field's KIND before anyone
   * reads the placeholder. Mount the house glyph (money is `Receipt`); the
   * slot supplies position and inset via `KIOSK_POS_ENTRY_ICON*`, so a caller
   * never hand-positions one. Single-line only: a textarea's first line is not
   * where a mark belongs.
   */
  icon?: ReactNode;
  testId?: string;
  /**
   * Disambiguator for the derived DOM id.
   *
   * REQUIRED when the same field NAME repeats on one screen — the repair
   * pane's device repeater asks every device for its own "Serial number".
   * Without it every copy after the first shares an id with the first, so its
   * `<label for>` resolves to the wrong input and a screen reader announces
   * the wrong device's field.
   */
  idScope?: string;
  /**
   * Return key → this (single-line only). The iPad key reads `go`, so the
   * staffer finishes the step from the keyboard that is covering its floor.
   */
  onEnter?: () => void;
  /** Focus on mount — a field the staffer just asked for (`+ Add serial`). */
  autoFocus?: boolean;
}) {
  const id = ['kiosk-entry', idScope, name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()]
    .filter(Boolean)
    .join('-');
  const withIcon = Boolean(icon) && !multiline;
  const onKeyDown = onEnter
    ? (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEnter();
      }
    : undefined;
  return (
    <div className={withIcon ? KIOSK_POS_ENTRY_ICON_HOST : undefined}>
      <label htmlFor={id} className="sr-only">
        {name}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={name}
          autoComplete={autoComplete}
          maxLength={maxLength}
          inputMode={inputMode}
          data-testid={testId}
          className={KIOSK_POS_ENTRY_AREA}
        />
      ) : (
        <>
          {withIcon ? (
            <span className={KIOSK_POS_ENTRY_ICON} aria-hidden>
              {icon}
            </span>
          ) : null}
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={name}
            autoComplete={autoComplete}
            maxLength={maxLength}
            inputMode={inputMode}
            enterKeyHint={onEnter ? 'go' : undefined}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            data-testid={testId}
            className={cn(KIOSK_POS_ENTRY, withIcon && KIOSK_POS_ENTRY_ICON_INSET)}
          />
        </>
      )}
    </div>
  );
}
