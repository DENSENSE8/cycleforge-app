'use client';

/** KioskEntryField — the ONE text entry control of the kiosk step path, and of every desk flow that wears the kiosk face (desk repair… */

import type { KeyboardEvent, ReactNode } from 'react';
import {
  KIOSK_POS_ENTRY,
  KIOSK_POS_ENTRY_AREA,
  KIOSK_POS_ENTRY_ICON,
  KIOSK_POS_ENTRY_ICON_HOST,
  KIOSK_POS_ENTRY_ICON_INSET,
  KIOSK_POS_ENTRY_ICON_NEUTRAL,
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
  iconTone = 'money',
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
  /** Leading glyph inside the field — states the field's KIND before anyone reads the placeholder. */
  icon?: ReactNode;
  /**
   * Ink of the leading glyph. `money` (default) is the price field's green
   * mark; `neutral` is soft ink for glyphs that only name the field's kind.
   */
  iconTone?: 'money' | 'neutral';
  testId?: string;
  /** Disambiguator for the derived DOM id. */
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
            <span
              className={iconTone === 'neutral' ? KIOSK_POS_ENTRY_ICON_NEUTRAL : KIOSK_POS_ENTRY_ICON}
              aria-hidden
            >
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
