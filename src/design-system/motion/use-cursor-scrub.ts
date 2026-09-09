'use client';

import { useEffect } from 'react';
import { publishCursorScrub } from './cursor-scrub';

/**
 * Publish a control's live value to the cursor for as long as it is being
 * dragged, and clear it the moment the drag ends or the control unmounts.
 *
 * The control keeps ownership of formatting — this hook never sees a number, so
 * a percentage, a px count and a date all read correctly without the cursor
 * layer knowing what any of them are.
 *
 * Pair it with a value the control ALSO renders in the DOM. The cursor is where
 * the eye already is mid-drag; it is not where the value lives.
 */
export function useCursorScrub({
  active,
  label,
  value,
}: {
  active: boolean;
  label: string;
  value: string;
}): void {
  useEffect(() => {
    if (!active) return;
    publishCursorScrub({ label, value });
    return () => publishCursorScrub(null);
  }, [active, label, value]);
}
