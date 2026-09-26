'use client';

/**
 * KioskFloatingPhoneKeypad — the Contact step's phone keypad as a MOUNTED
 * display, not a keypad living inside the form (operator 2026-09-25: tapping
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
