'use client';

/**
 * The app-wide home for clipboard history — the chord owner and the **single**
 * desktop mount of {@link ClipboardHistoryPopover}.
 *
 * ## Why the button stayed in the spine ⋯ (D5, decided 2026-08-02)
 *
 * The 2026-08-01 chrome-altitude brief ruled *"Clipboard history → command
 * palette only"*. That was not executed, and should not be: the palette is
 * navigate-only by construction (every row resolves to `router.push`), while a
 * clipboard entry carries three actions plus a staff-picker sub-flow. Asking a
 * one-command-per-row surface to host a three-action panel is the same
 * shape-mismatch that got D3 and D8 rejected.
 *
 * The placement question was re-decided against industry precedent instead, and
 * every comparable answers it the same way. Windows Clipboard History (`Win+V`),
 * Raycast, Alfred (`⌥⌘C`), Paste (`⇧⌘V`), Maccy, Ditto — **none** of them put
 * clipboard history on a primary toolbar. It lives in the menu bar / system
 * tray, and the hotkey is what daily users actually press; the icon is there for
 * discovery. `StaffAccountFooter` ⋯ *is* this app's menu bar, so the button was
 * already in the right neighbourhood — a utility drawer does not distinguish
 * setup utilities from work utilities, and clipboard history sitting beside a QR
 * sign-in is exactly Paste sitting beside a VPN toggle.
 *
 * So what was missing was never a better button. It was the chord: **`⌘⇧V`**,
 * the closest thing to a convention (Paste's binding). Option A + D.
 *
 * ## Why the panel lives HERE and not in the footer
 *
 * `StaffAccountFooter` mounts only from `SidebarNavList`, inside
 * `SidebarNavColumn` — which mounts lazily on FIRST open (`everOpened`) over a
 * `navOpen` that is unpersisted `useState(false)`. So on every page load the
 * footer, and its clipboard button, **do not exist yet**. A chord bound there
 * would be dead until the operator opened the spine, which is precisely the
 * situation the chord exists to fix.
 *
 * This host is mounted unconditionally by `ResponsiveLayout`, owns the open
 * state, and the footer button now *asks* it to open
 * ({@link CLIPBOARD_HISTORY_OPEN_EVENT}). Two triggers, **one mount, one state**
 * — not two doors onto one panel. The panel is pinned bottom-left, where the
 * spine footer sits when open, so both triggers land it in the same place
 * whether the spine is open or not (Paste and Maccy likewise open in one fixed
 * spot regardless of how they were summoned).
 *
 * Mobile keeps its own anchored instance in `GlobalHeaderActions`: it has no
 * spine, therefore no overflow, and no keyboard to press a chord with.
 *
 * ## Why this chord DOES stand down inside text fields
 *
 * The opposite of the ⌘K rule, deliberately. `CommandBar`'s docblock argues that
 * a modifier chord never competes with typing because nobody *types* ⌘K — true
 * of ⌘K, false of ⌘⇧V, which is **paste-without-formatting** in Chrome, Safari
 * and most editors. Inside an editable element that native meaning wins; an
 * operator pasting plain text into a note must not get a popover instead. The
 * ⌘K carve-out was scoped to one input for the same class of reason.
 *
 * Guard: `clipboard-hotkey-owner.guard.test.ts` (one binder, and the label and
 * the binding ship together — the `cmdk-owner` rule, applied to this chord).
 */

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
