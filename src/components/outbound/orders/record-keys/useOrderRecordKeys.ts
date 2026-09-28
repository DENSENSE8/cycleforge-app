'use client';

/**
 * The open order record's own letters — T replace tracking, N focus the note,
 * E edit shipping, M print the packing slip — beside the action strip's verb
 * letters, under the strip's guards (no modifiers, not while typing, not under
 * an open overlay). Listed in the `?` overview as "This record" while live;
 * a key with no handler is neither bound nor listed.
 */

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { PRINT_SLIP_HOTKEY } from './print-slip';

type Handlers = {
  onReplaceTracking?: () => void;
  onFocusNote?: () => void;
  onEditShipping?: () => void;
  onPrintSlip?: () => void;
};

const RECORD_KEYS: readonly { key: string; handler: keyof Handlers; label: string }[] = [
  { key: 't', handler: 'onReplaceTracking', label: 'Replace tracking' },
  { key: 'n', handler: 'onFocusNote', label: 'Write a note' },
  { key: 'e', handler: 'onEditShipping', label: 'Edit shipping address' },
  { key: PRINT_SLIP_HOTKEY, handler: 'onPrintSlip', label: 'Print packing slip' },
];

export function useOrderRecordKeys(opts: { enabled: boolean } & Handlers): void {
  const latest = useRef(opts);
  latest.current = opts;

  // Which keys exist is the effect's dependency; the handlers stay latest-ref.
  const bound = opts.enabled ? RECORD_KEYS.filter((entry) => opts[entry.handler]).map((entry) => entry.key).join('') : '';

  useEffect(() => {
    if (!bound) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const letter = event.key.length === 1 ? event.key.toLowerCase() : '';
      const entry = letter ? RECORD_KEYS.find((candidate) => candidate.key === letter) : undefined;
      const run = entry ? latest.current[entry.handler] : undefined;
      if (!run) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      run();
    };
    window.addEventListener('keydown', onKeyDown, true);
    const unregister = registerShortcutOverviewGroup({
      id: 'order-record-keys',
      title: 'This record',
      rows: RECORD_KEYS.filter((entry) => bound.includes(entry.key)).map((entry) => ({
        keys: [entry.key.toUpperCase()],
        label: entry.label,
      })),
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      unregister();
    };
  }, [bound]);
}
