'use client';

import { useEffect } from 'react';
import { publishCursorScrub } from './cursor-scrub';

/** Publish a control's live value to the cursor for as long as it is being dragged, and clear it the moment the drag ends or the control… */
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
