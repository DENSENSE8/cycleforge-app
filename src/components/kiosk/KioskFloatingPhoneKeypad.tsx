'use client';

/**
 * KioskFloatingPhoneKeypad — the Contact step's phone keypad as a MOUNTED
 * display, not a keypad living inside the form (operator 2026-09-25: tapping
 * the phone field mounts the pad; it goes away when done).
 *
 * ## Why a custom pad at all (checked 2026-09-25)
 *
 * iPad Safari cannot raise a numeric-only phone pad for a web field.
 * `inputmode="numeric"` / `"tel"` are only hints (MDN, `inputmode`), and
 * WebKit hands them to UIKit as a `UIKeyboardType`; iPadOS has no number-only
 * or phone-pad keyboard, so UIKit falls back to the closest match — the full
 * keyboard on its numbers layer. UIKit's own `UITextInputTraits.h`: "the input
 * method will make a best effort to find a close match to the requested type
 * (e.g. displaying UIKeyboardTypeNumbersAndPunctuation type if
 * UIKeyboardTypeNumberPad is not supported)"; iPad: "iPad doesn't have number
 * only keyboard. You should implement your own."
 *   - https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
 *   - https://stackoverflow.com/a/2599744 (quotes UITextInputTraits.h)
 *   - https://stackoverflow.com/a/53249363
 * So the field keeps `inputMode="none"` (no OS keyboard at all) and this pad
 * is the phone's only on-glass input.
 *
 * ## Where it floats
 *
 * Portalled into the pane's dock ({@link useKioskPaneDock}) — the in-flow
 * band between the scroll body and the action floor. It sits in the thumb
 * zone directly ABOVE the step's Continue and can never cover it: mounting it
 * shrinks the scroll body, the floor stays put. Outside a pane it renders in
 * place.
 *
 * ## How it goes away
 *
 * The X, Escape, or a tap / focus anywhere outside the pad and the phone
 * field. It does NOT auto-close on the tenth digit: the pad vanishing would
 * put the Name / Address fields under the thumb that was just on the keys, so
 * a hurried extra tap would land in a text field and raise the OS keyboard.
 * The staffer's next move (Continue below, or Name above) closes it anyway.
 *
 * Keys are {@link KioskPhoneKeypad}'s — the pad owns no key logic. A mouse /
 * touch press never takes focus from the phone input, so a desk keyboard keeps
 * typing into the field while the pad is up.
 *
 * Callers: `KioskCustomerIntake` (entry face). Affected API: none. Schemas: none.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { KioskPhoneKeypad, type PhoneKeypadPress } from '@/components/kiosk/KioskAmountKeypad';
import { useKioskPaneDock } from '@/components/kiosk/KioskPaneForm';
import { KIOSK_POS_FORM_MEASURE } from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';

export function KioskFloatingPhoneKeypad({
  open,
  phone,
  onPress,
  onClose,
  anchorRef,
}: {
  open: boolean;
  /** The number as the field shows it (`555-867-5309`). */
  phone: string;
  onPress: (key: PhoneKeypadPress) => void;
  onClose: () => void;
  /** The phone field's host — a tap on it is not "outside". */
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const dock = useKioskPaneDock();
  const padRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (padRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKeyDown);
    // The dock shrinks the scroll body; keep the field it types into in view.
    const frame = requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ block: 'nearest' }));
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  const pad = (
    <div
      ref={padRef}
      role="region"
      aria-label="Phone number entry"
      // Presses must not pull focus off the phone input (desk keyboard, Return).
      onMouseDown={(event) => event.preventDefault()}
      className="border-t border-border-soft bg-surface-card"
      data-testid="kiosk-phone-pad"
    >
      <div className={cn(KIOSK_POS_FORM_MEASURE, 'px-4 pt-3')}>
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
          <span aria-hidden />
          <output
            aria-live="polite"
            className={cn(
              'block truncate text-center text-5xl font-bold tracking-tight tabular-nums',
              phone ? 'text-text-default' : 'text-text-faint',
            )}
            data-testid="kiosk-phone-pad-display"
          >
            {phone || 'Phone number'}
          </output>
          <IconButton
            icon={<X className="h-5 w-5" aria-hidden />}
            ariaLabel="Close keypad"
            size="md"
            onClick={onClose}
            data-testid="kiosk-phone-pad-close"
          />
        </div>
        <KioskPhoneKeypad onPress={onPress} className="mt-3" />
      </div>
    </div>
  );

  return dock ? createPortal(pad, dock) : pad;
}
