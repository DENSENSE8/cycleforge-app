'use client';

/**
 * The app-wide home for **throwing a task** — the `⌘⇧U` owner and the single
 * desktop mount of {@link ThrowTaskPanel}.
 *
 * This is the surface the whole WS-TASKS lane exists for. Everything under it —
 * the urgency SoT, the `FOLLOW_UP` work_assignment, the inbox row and its Ably
 * leg — has been reachable only through a raw `POST /api/tasks` until now.
 *
 * ## Why a chord and not a sixth header icon
 *
 * `GlobalHeaderActions` is rule-capped at five (find · goal · work order · inbox
 * · assistant), and the cap is not arbitrary: a persistent top-right icon is
 * earned by FREQUENCY, and throwing a task is a handful of times a shift, not a
 * standing destination. The clipboard-history ruling (D5) already settled this
 * exact shape for this exact neighbourhood — menu-bar drawer for discovery, a
 * chord for the people who do it daily — so this follows it rather than
 * re-litigating it. The ⋯ row in `StaffAccountFooter` is the discovery entry;
 * the chord is what an operator with a label in their hand actually presses.
 *
 * ## Why the host, and not the footer button, owns the binding
 *
 * `StaffAccountFooter` mounts only from `SidebarNavList` inside
 * `SidebarNavColumn`, which mounts lazily on FIRST open over an unpersisted
 * `navOpen = useState(false)`. On a fresh page load that button does not exist,
 * so a chord bound there is dead exactly when it is most wanted. This host is
 * mounted unconditionally by `ResponsiveLayout`, owns the open state, and the
 * footer row *asks* it to open ({@link THROW_TASK_OPEN_EVENT}) — two triggers,
 * one mount, one state.
 *
 * ## Wedge safety
 *
 * A keyboard wedge emits bare characters and Enter, never with Meta/Ctrl held,
 * so a modifier chord cannot be fired by a scan. That is the same property that
 * makes ⌘K and ⌘⇧V safe on a bench, and it is why the throw surface is a chord
 * rather than a bare key.
 *
 * ## Why this chord DOES stand down inside text fields
 *
 * The clipboard chord stands down because `⌘⇧V` *is* paste-without-formatting —
 * a native meaning that must win. **That reason does not transfer**: `⌘⇧U` has
 * no native meaning in a browser text field, so the ⌘K argument ("nobody types
 * this chord, so there is nothing to yield to") would apply on its face.
 *
 * It stands down anyway, for a different reason. The panel autofocuses its own
 * scan field, so firing the chord takes the caret out of whatever the operator
 * was typing — a carton note, a ticket reply — and gives it to a popover. On a
 * bench that is a half-written note abandoned mid-word, and the cost of the
 * alternative is one click through the ⋯ menu. Yielding to the field the
 * operator is already in is the cheaper mistake.
 *
 * Guard: `throw-task-hotkey-owner.guard.test.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { THROW_TASK_OPEN_EVENT } from '@/lib/app-events';
import { ThrowTaskPanel } from './ThrowTaskPanel';

/**
 * The chord, as one declaration. Every label that advertises it imports this, so
 * a rebinding cannot leave a stale hint behind — a false shortcut hint is worse
 * than no hint, because it teaches a chord that does something else.
 */
export const THROW_TASK_HOTKEY_LABEL = '⌘⇧U';

/** Ask the host to open the throw panel. Safe to call from any client handler. */
export function openThrowTask(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(THROW_TASK_OPEN_EVENT));
}

/** True when the operator is mid-sentence and the caret should stay put. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

export function ThrowTaskHost() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // An invisible bottom-left anchor, so AnchoredLayer keeps owning dismissal
  // (Escape + outside-click + overlay stacking) instead of this host forking it.
  // Same corner as clipboard history: both are summoned from the spine ⋯, and
  // both should land where that drawer sits whether the spine is open or not.
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(THROW_TASK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(THROW_TASK_OPEN_EVENT, onOpen);
  }, []);

  const handleKeyDown = useCallback((e: globalThis.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    // `toLowerCase` so Shift/Caps still resolve to the same chord.
    if (e.key.toLowerCase() !== 'u') return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Signed out there is nobody to throw at, and no staff id to throw from.
  if (!user) return null;

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden
        className="pointer-events-none fixed bottom-3 left-3 h-px w-px"
        data-throw-task-anchor
      />
      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="top-start"
        level="panelPopover"
        gap={4}
      >
        <ThrowTaskPanel onClose={() => setOpen(false)} />
      </AnchoredLayer>
    </>
  );
}
