'use client';

/** The keyboard of {@link RecordActionStrip}: */

import { useEffect, useId, useRef } from 'react';
import { claimOverlay, hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import {
  registerSelectionInlineHotkeySurface,
  shouldSuppressSelectionQuestionMark,
  toggleSelectionInlineHotkeys,
} from '@/hooks/useSelectionStatusBarHotkeys';
import { closeShortcutOverview, registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { findDuplicateVerbHotkeys } from './record-verb-scope';
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
      // A text field keeps its own keys — Escape cancels the field's edit (an
      // inline note), it does not clear the check-set under it.
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      if (event.key === 'Escape') {
        const dismiss = latest.current.onDismiss;
        if (!dismiss) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss();
        return;
      }
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

  // The `?` overview lists the live strip's letters (the first claimant of a
  // letter is the one the handler above runs, so later duplicates drop).
  const overviewId = useId();
  const overviewRows = verbsLive
    ? verbs
        .filter((verb) => verb.hotkey)
        .filter((verb, index, all) => all.findIndex((v) => v.hotkey?.toLowerCase() === verb.hotkey?.toLowerCase()) === index)
        .filter((verb) => !verb.disabled)
        .map((verb) => `${verb.hotkey!.toUpperCase()}\u0000${verb.label}`)
        .join('\u0001')
    : '';
  useEffect(() => {
    if (!overviewRows) return;
    return registerShortcutOverviewGroup({
      id: `record-verbs:${overviewId}`,
      title: 'Record actions',
      rows: overviewRows.split('\u0001').map((row) => {
        const [key, label] = row.split('\u0000');
        return { keys: [key], label };
      }),
    });
  }, [overviewId, overviewRows]);

  const duplicateKey = process.env.NODE_ENV === 'production' ? '' : JSON.stringify(findDuplicateVerbHotkeys(verbs));
  useEffect(() => {
    if (!duplicateKey || duplicateKey === '[]') return;
    console.warn('[RecordActionStrip] verbs share a hotkey; only the first runs:', duplicateKey);
  }, [duplicateKey]);

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
