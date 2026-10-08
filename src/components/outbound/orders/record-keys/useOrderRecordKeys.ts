'use client';

/**
 * The open order record's own letters ({@link ORDER_RECORD_KEYS}: W replace
 * tracking, N focus the note, M print the packing slip) — beside the action
 * strip's verb letters, under the strip's guards (no modifiers, not while
 * typing, not under an open overlay). Listed in the `?` overview as "This
 * record" while live; a key with no handler is neither bound nor listed.
 */

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { ORDER_RECORD_KEYS, type OrderRecordKeyHandler } from './order-key-table';

type Handlers = Partial<Record<OrderRecordKeyHandler, () => void>>;

export function useOrderRecordKeys(opts: { enabled: boolean } & Handlers): void {
  const latest = useRef(opts);
  latest.current = opts;

  // Which keys exist is the effect's dependency; the handlers stay latest-ref.
  const bound = opts.enabled ? ORDER_RECORD_KEYS.filter((entry) => opts[entry.handler]).map((entry) => entry.key).join('') : '';

  useEffect(() => {
    if (!bound) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const letter = event.key.length === 1 ? event.key.toLowerCase() : '';
      const entry = letter ? ORDER_RECORD_KEYS.find((candidate) => candidate.key === letter) : undefined;
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
      rows: ORDER_RECORD_KEYS.filter((entry) => bound.includes(entry.key)).map((entry) => ({
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
