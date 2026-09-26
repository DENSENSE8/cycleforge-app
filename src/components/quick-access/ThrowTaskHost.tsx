'use client';

/** The app-wide home for **throwing a task** — the `⌘⇧U` owner and the single desktop mount of {@link ThrowTaskPanel}. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { THROW_TASK_OPEN_EVENT } from '@/lib/app-events';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
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
  // An invisible bottom-left anchor, so AnchoredLayer keeps owning dismissal (Escape + outside-click + overlay stacking) instead of this…
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

  /** Teach the chord where the staff `?` already looks. */
  useEffect(() => {
    if (!user) return;
    return registerShortcutOverviewGroup({
      id: 'tasks',
      title: 'Tasks',
      rows: [{ keys: ['⌘', '⇧', 'U'], label: 'Assign a task to a colleague' }],
    });
  }, [user]);

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
