'use client';

/**
 * To-ship **L** — toggles the Labels walk. The verb itself is the sidebar's
 * `orders:labels-walk`; the key stays with the table that owns the walk.
 */

import { useEffect, useRef } from 'react';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

export function useLabelsWalkShortcut({
  enabled,
  walkOpen,
  disabled,
  onToggle,
}: {
  /** Off the To-ship desk the key belongs to nobody. */
  enabled: boolean;
  walkOpen: boolean;
  /** No rows to walk — the key can still close an open walk. */
  disabled: boolean;
  onToggle: () => void;
}): void {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    if (!enabled) return undefined;
    return registerShortcutOverviewGroup({
      id: 'to-ship-labels',
      title: 'To-ship',
      rows: [{ keys: ['L'], label: 'Labels display' }],
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'l') return;
      if (isEditableKeyTarget(e.target)) return;
      if (hasOpenOverlay()) return;
      if (disabled && !walkOpen) return;
      e.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, disabled, walkOpen]);
}
