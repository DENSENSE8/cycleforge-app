'use client';

/**
 * useSessionHotkeys — the /ai-chat keyboard, in one place (plan §B.9).
 *
 *   ⌘N / Ctrl+N        new chat — Chrome keeps this chord for a new window
 *                      in a normal tab, so it only lands in a standalone
 *                      PWA / desktop window; hence the in-tab twin:
 *   ⌘⇧O / Ctrl+Shift+O new chat
 *   ⌘/ / Ctrl+/        focus the composer
 *   Esc                stop the running turn. Capture phase +
 *                      preventDefault, so the side panel's own Esc (which
 *                      respects defaultPrevented) does not also close it.
 *   ⌘⇧C / Ctrl+Shift+C copy the last answer (browsers that reserve it for
 *                      DevTools never deliver it) — ⌘⇧; / Ctrl+Shift+; is
 *                      the chord every browser lets through.
 *
 * ↑ in an empty composer (edit the last message) and Esc cancelling an edit
 * are the composer's own keys, wired through `AiComposer.onKeyDown` after the
 * mention list has had its turn — not window bindings.
 */

import { useEffect, useRef } from 'react';

export interface SessionHotkeyHandlers {
  onNewChat: () => void;
  onFocusComposer: () => void;
  /** A turn is running: Esc stops it. */
  streaming: boolean;
  onStop: () => void;
  onCopyLastAnswer: () => void;
}

export function useSessionHotkeys(handlers: SessionHotkeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (e.key === 'Escape') {
        if (e.defaultPrevented || e.isComposing || !h.streaming) return;
        e.preventDefault();
        e.stopPropagation();
        h.onStop();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if ((key === 'n' && !e.shiftKey) || (key === 'o' && e.shiftKey)) {
        e.preventDefault();
        h.onNewChat();
      } else if (key === '/' && !e.shiftKey) {
        e.preventDefault();
        h.onFocusComposer();
      } else if (e.shiftKey && (key === 'c' || e.code === 'Semicolon')) {
        e.preventDefault();
        h.onCopyLastAnswer();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);
}
