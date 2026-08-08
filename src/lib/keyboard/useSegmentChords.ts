'use client';

/**
 * Bind Alt+1…N onto the mounted child segment tab ids (Claim New·Link golden).
 * Single owner — leaves call this; no page-local `window` listeners.
 *
 * Fires while the segment host is mounted (Displays leaf-header or modal strip).
 * Stands down in inputs / comboboxes. Bare digits never bind (wedge).
 */

import { useEffect } from 'react';
import {
  isSegmentChordEditableTarget,
  segmentChordIndexFromEvent,
} from '@/lib/keyboard/segment-chords';

export function useSegmentChords({
  enabled,
  tabIds,
  onTabChange,
}: {
  /** False when the segment is unmounted (e.g. Chat presence). */
  enabled: boolean;
  /** Ordered segment ids — index 0 = Alt+1. */
  tabIds: readonly string[];
  onTabChange: (tabId: string) => void;
}): void {
  useEffect(() => {
    if (!enabled || tabIds.length === 0) return;

    const onKey = (e: KeyboardEvent) => {
      if (isSegmentChordEditableTarget(e.target)) return;
      const idx = segmentChordIndexFromEvent(e);
      if (idx == null || idx >= tabIds.length) return;
      const id = tabIds[idx];
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      onTabChange(id);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, tabIds, onTabChange]);
}
