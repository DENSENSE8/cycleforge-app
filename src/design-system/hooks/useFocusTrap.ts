'use client';

import { useEffect, useRef } from 'react';

/**
 * Everything natively tabbable. Visibility is checked at keydown time (via
 * getClientRects) so conditionally-hidden controls drop out of the cycle.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Trap Tab/Shift+Tab inside a modal container while `active` is true. */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0,
      );

    // Focus the dialog root (tabIndex={-1}), never the first control — opening a modal must not visibly highlight/tooltip a button (e.g.
    if (!container.contains(document.activeElement)) {
      container.focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const current = document.activeElement;
      const first = items[0];
      const last = items[items.length - 1];
      // The dialog root is `tabIndex={-1}` — programmatically focusable but not
      // in FOCUSABLE_SELECTOR. Tab from it must land on the first control, not
      // leak to the page behind the scrim.
      if (current === container) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !container.contains(e.target)) {
        container.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [active]);

  return containerRef;
}
