'use client';

/**
 * Ambient record-stepping keyboard, driven by the record-cursor store:
 *   j / ↓  — next record (opens it)
 *   k / ↑  — previous record
 *   Enter  — open the first record when nothing is open
 *   Esc    — close the open record
 *
 * WHAT CHANGED, AND WHY IT IS SMALLER
 * This was `useOutboundQueueKeyboard`, and it carried its own copy of
 * `findIndex → ±1 → open` **twice** (once per direction, inside a
 * `requestAnimationFrame` that re-derived the neighbour just to scroll to it).
 * It also had to be handed `orderedRecords` / `selectedId` / `context` /
 * `openRecord` by every call site, which meant three call sites each re-stating
 * knowledge the grid already had — and each able to disagree with it. All of
 * that now lives in one place: the publishing surface resolves the cursor
 * (`resolveRecordCursor`) and publishes `open`, so this hook only has to decide
 * WHICH end of the cursor a keystroke means. See
 * `docs/todo/record-cursor-unification-PLAN.md` §3.7.
 *
 * Two behaviours are deliberately preserved, not simplified away:
 *
 *  1. **`hasOpenOverlay()` is the whole reason this file is the reference.** The
 *     listener is CAPTURE phase, so its `stopPropagation()` runs before any
 *     bubble handler — without the bail-out it swallows Escape (and j/k) before
 *     an open popover / menu / cell editor ever sees it, closing the inspector
 *     while the popover stays on screen. The typing-target test below only
 *     covers input/textarea editors, never button-and-menu popovers. This is
 *     the only correct ambient keyboard owner in the codebase and the guard is
 *     why (`src/lib/overlay-stack/store.ts`; `source-of-truth.md` → Escape
 *     ownership).
 *  2. **Enter is not stolen from a focused row.** Rows are `tabIndex={0}` and
 *     handle Enter/Space for the record they belong to; this branch only knows
 *     how to open the FIRST record, so capturing here opened the wrong order
 *     whenever the operator had tabbed down.
 *
 * The store is read inside the handler rather than subscribed to, so this hook
 * never re-renders its host — a grid that re-publishes on every keystroke in its
 * filter box would otherwise re-run this effect for nothing.
 *
 * Scroll-into-view is the PUBLISHER's job now, not this hook's: a step can
 * reveal a collapsed fold, so the row it lands on may not be mounted until the
 * surface has expanded it. Guessing the neighbour from a stale list here (what
 * the two deleted `requestAnimationFrame` blocks did) could only ever scroll to
 * a row that was already on screen.
 */

import { useEffect } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { getRecordCursorTop } from '@/lib/record-cursor/store';
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

/**
 * Step to one end of the cursor.
 *
 * `position === null` means nothing resolvable is open, and the answer there is
 * `first` in BOTH directions — that is what `useOutboundQueueKeyboard:88` and
 * `useSidebarRail:427` already did, and dropping it would leave ↓ dead on a
 * freshly loaded queue.
 *
 * The intent is `'step'`, undefaulted at the call below and carried all the way
 * into the surface's `open`: a step must not clear `scanMatchedRows` the way a
 * row click does. That difference is the entire reason
 * `receiving-highlight-line` was forked from `receiving-select-line`
 * (`backend-patterns.md` → a safety classification takes no default).
 */
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

      // Escape is handled BEFORE the no-publisher bail, and is NOT gated on
      // `position`. Both of those were regressions against the hook this
      // replaced, and each killed dismissal in exactly the case it looked like
      // it served:
      //  • gating on a publisher made Escape dead on any surface that mounts the
      //    keyboard without a grid publishing — the old hook closed whenever a
      //    record was open, and it knew nothing about publishers.
      //  • gating on `position !== null` made Escape inert during the
      //    `?openOrderId=` boot window, where the panel is open but the queue's
      //    own fetch has not landed, so the open id is not yet IN the order
      //    (`useOrdersQueueSelection.ts:73-79`). That is precisely when an
      //    operator hits Escape.
      // Close is not the cursor's job: a publisher that owns dismissal says so,
      // otherwise the legacy bridge closes the shipped panel (untouched by
      // Phase 1). With no publisher at all the dispatch is a no-op, so the key
      // is left un-swallowed rather than consumed by a listener that did nothing.
      if (code === 'Escape') {
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

      // Every other key steps a list, so from here on a publisher is required:
      // a capture listener must not swallow j/k/↓/↑ it cannot act on.
      if (!top) return;

      if (code === 'KeyJ' || code === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        stepCursor(top, 'next');
        return;
      }

      if (code === 'KeyK' || code === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        stepCursor(top, 'prev');
        return;
      }

      if (code === 'Enter') {
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
  }, [enabled, scope]);
}
