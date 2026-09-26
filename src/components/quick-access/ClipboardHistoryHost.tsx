'use client';

/** The app-wide home for clipboard history — the chord owner and the **single** desktop mount of {@link ClipboardHistoryPopover}. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { CLIPBOARD_HISTORY_OPEN_EVENT } from '@/lib/app-events';
import { ClipboardHistoryPopover } from './ClipboardHistoryPopover';

/**
 * The chord, as one declaration. The label rendered in the ⋯ menu imports this
 * so a rebinding cannot leave a stale hint behind — a false shortcut hint is
 * worse than none.
 */
export const CLIPBOARD_HISTORY_HOTKEY_LABEL = '⌘⇧V';

/** Ask the host to open the clipboard panel. Safe to call from any client handler. */
export function openClipboardHistory(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLIPBOARD_HISTORY_OPEN_EVENT));
}

/** True when the chord's native meaning (paste-and-match-style) should win. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

export function ClipboardHistoryHost() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // An invisible bottom-left anchor, so AnchoredLayer keeps owning dismissal
  // (Escape + outside-click + stacking) instead of this host forking it.
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(CLIPBOARD_HISTORY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CLIPBOARD_HISTORY_OPEN_EVENT, onOpen);
  }, []);

  const handleKeyDown = useCallback((e: globalThis.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    // `toLowerCase` so Shift/Caps still resolve to the same chord.
    if (e.key.toLowerCase() !== 'v') return;
    // Paste-without-formatting belongs to the field the operator is typing in.
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Signed out there is no clipboard to show — and no spine either.
  if (!user) return null;

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden
        className="pointer-events-none fixed bottom-3 left-3 h-px w-px"
        data-clipboard-history-anchor
      />
      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="top-start"
        level="panelPopover"
        gap={4}
      >
        <ClipboardHistoryPopover onClose={() => setOpen(false)} />
      </AnchoredLayer>
    </>
  );
}
