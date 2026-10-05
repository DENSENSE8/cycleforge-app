'use client';

/**
 * The /support desk's own bare keys: N opens the inline create, S opens the
 * open record's status verb (J / K step the records through the record
 * cursor). Never while typing, with an overlay up, a modifier held, or the
 * create form on the stage. Listed in the `?` sheet.
 */

import { useEffect } from 'react';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { NEW_SUPPORT_ITEM_LABEL } from './SupportNewItemStage';

const SUPPORT_DESK_SHORTCUTS = {
  id: 'support-desk',
  title: 'Support items',
  rows: [
    { keys: ['J'], label: 'Next Support item (↓)' },
    { keys: ['K'], label: 'Previous Support item (↑)' },
    { keys: ['Enter'], label: 'Open the focused Support item' },
    { keys: ['N'], label: `${NEW_SUPPORT_ITEM_LABEL} (C too — C is create on every page)` },
    { keys: ['S'], label: 'Status of the open Support item — Waiting on customer, On-hold, Reopen, Resolve' },
    { keys: ['Esc'], label: 'Close the record' },
  ],
};

export function useSupportDeskKeys({
  composing,
  onCreate,
  recordOpen,
  onStatus,
}: {
  composing: boolean;
  /** Null when the staffer may not create Support items. */
  onCreate: (() => void) | null;
  recordOpen: boolean;
  onStatus: () => void;
}) {
  useEffect(() => registerShortcutOverviewGroup(SUPPORT_DESK_SHORTCUTS), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (composing || isEditableKeyTarget(event.target) || hasOpenOverlay()) return;
      const key = event.key.toLowerCase();
      if (key === 'n' && onCreate) onCreate();
      else if (key === 's' && recordOpen) onStatus();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composing, onCreate, recordOpen, onStatus]);
}
