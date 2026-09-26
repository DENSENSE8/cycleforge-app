'use client';

/**
 * The keyboard of {@link RecordActionStrip}: a display claims the overlay
 * stack and backs out on Escape (after any popover opened inside it); the
 * verbs view runs each verb's letter, owns `?` (the shared selection-hotkey
 * reveal store) and, when the host passes `onDismiss`, Escape.
 */

import { useEffect, useRef } from 'react';
import { claimOverlay, hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import {
  registerSelectionInlineHotkeySurface,
  shouldSuppressSelectionQuestionMark,
  toggleSelectionInlineHotkeys,
} from '@/hooks/useSelectionStatusBarHotkeys';
import { closeShortcutOverview } from '@/lib/keyboard/shortcut-overview';
import type { RecordActionVerb } from './RecordActionStrip';

export function useRecordActionStripKeys({
  verbs,
  displayOpen,
  press,
  done,
  onDismiss,
}: {
  verbs: readonly RecordActionVerb[];
  displayOpen: boolean;
  press: (verb: RecordActionVerb) => void;
  done: () => void;
  onDismiss?: () => void;
}): void {
  // Latest render's state for the window listeners (bound once per mode).
  const latest = useRef({ verbs, press, done, onDismiss });
  latest.current = { verbs, press, done, onDismiss };

  // A display holds the keyboard like any overlay: the record plane and the
  // ambient row keys stand down while it is up. Escape backs out of it unless
  // a popover opened inside it sits above (that popover closes first).
  useEffect(() => {
    if (!displayOpen) return;
    const claim = claimOverlay();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !claim.isTopmost()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      latest.current.done();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      claim.release();
    };
  }, [displayOpen]);

  // Verbs view: letters run their verb; Escape dismisses a dismissible strip.
  const verbsLive = verbs.length > 0 && !displayOpen;
  useEffect(() => {
    if (!verbsLive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (hasOpenOverlay()) return;
      if (event.key === 'Escape') {
        const dismiss = latest.current.onDismiss;
        if (!dismiss) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss();
        return;
      }
      if (isEditableKeyTarget(event.target)) return;
      const letter = event.key.length === 1 ? event.key.toLowerCase() : '';
      if (!letter) return;
      const verb = latest.current.verbs.find((candidate) => candidate.hotkey?.toLowerCase() === letter);
      if (!verb || verb.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      latest.current.press(verb);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [verbsLive]);

  // `?` reveal — the shared selection-hotkey store, so the table foot and this
  // strip show and hide their letters together. A `?` another surface already
  // handled (defaultPrevented) is not toggled back.
  const hasHotkeys = verbs.some((verb) => verb.hotkey);
  useEffect(() => {
    if (!verbsLive || !hasHotkeys) return;
    const release = registerSelectionInlineHotkeySurface();
    const onQuestion = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldSuppressSelectionQuestionMark(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeShortcutOverview();
      toggleSelectionInlineHotkeys();
    };
    window.addEventListener('keydown', onQuestion, true);
    return () => {
      window.removeEventListener('keydown', onQuestion, true);
      release();
    };
  }, [verbsLive, hasHotkeys]);
}
