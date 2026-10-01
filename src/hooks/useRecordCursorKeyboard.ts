'use client';

/** Ambient record-stepping keyboard, driven by the record-cursor store: */

import { useEffect } from 'react';
import { focusWithinListKeyOwner, isListKeyRegionOpen } from '@/lib/keyboard/list-key-scope';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { getRecordCursorTop } from '@/lib/record-cursor/store';
import { recordCursorKeyDirection } from '@/lib/record-cursor/keyboard-order';
import type { CursorScope, CursorStep } from '@/lib/record-cursor/cursor-model';
import type { RecordCursorPublication } from '@/lib/record-cursor/store';
import { dispatchCloseShippedDetails } from '@/utils/events';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
  return false;
}

/** Step to one end of the cursor. */
function stepCursor(top: RecordCursorPublication, direction: 'prev' | 'next'): boolean {
  const { cursor } = top;
  const target: CursorStep | null =
    cursor.position === null ? cursor.first : direction === 'prev' ? cursor.prev : cursor.next;
  if (!target) return false;
  top.open(target.id, { intent: 'step', revealFoldKey: target.revealFoldKey });
  return true;
}

export function useRecordCursorKeyboard({
  enabled,
  scope,
  escape = true,
}: {
  /**
   * The host's visibility/ownership claim. Required — a hook that inferred it
   * from mount order would bind two listeners across a route swap.
   */
  enabled: boolean;
  /**
   * Which cursor these keys drive. Receiving runs a `'record'` (carton table)
   * and a `'sibling'` (lines inside the open carton) cursor at once, with
   * different totals — so this is REQUIRED and undefaulted, like `intent`.
   */
  scope: CursorScope;
  /** `false` when a `DeskRecordPlane` shows the record: */
  escape?: boolean;
}): void {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      // The innermost open overlay owns the keyboard — see the docblock. Never
      // move this below a `preventDefault()`.
      if (hasOpenOverlay()) return;

      const top = getRecordCursorTop(scope);
      const code = e.code;

      // Escape is handled BEFORE the no-publisher bail, and is NOT gated on `position`.
      if (code === 'Escape') {
        if (!escape) return;
        if (top?.close) {
          e.preventDefault();
          e.stopPropagation();
          top.close();
        } else if (top) {
          e.preventDefault();
          e.stopPropagation();
          dispatchCloseShippedDetails();
        } else {
          dispatchCloseShippedDetails();
        }
        return;
      }

      // A focused list owns its own navigation keys (roving tabindex).
      if (focusWithinListKeyOwner(e.target)) return;
      // …and stand down entirely while an open Station Displays push column is up:
      if (isListKeyRegionOpen()) return;

      // Every other key steps a list, so from here on a publisher is required:
      // a capture listener must not swallow j/k/↓/↑ it cannot act on.
      if (!top) return;

      const direction = recordCursorKeyDirection(code, top.keyOrder);
      if (direction) {
        e.preventDefault();
        e.stopPropagation();
        stepCursor(top, direction);
        return;
      }

      if (code === 'Enter') {
        // A scanner's terminating Enter: the wedge listener (window capture,
        // bound first) committed the scan and prevented it — the scan decides
        // what opens, not "open the first record".
        if (e.defaultPrevented) return;
        // Don't steal Enter from buttons/links.
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        // …or from a focused row, which opens its OWN record (see docblock).
        if (e.target instanceof Element && e.target.closest('[data-order-row-id]')) return;
        if (top.cursor.position !== null) return;
        if (!top.cursor.first) return;
        e.preventDefault();
        e.stopPropagation();
        stepCursor(top, 'next');
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, scope, escape]);
}
