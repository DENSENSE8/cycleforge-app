'use client';

import { RefreshCw } from '@/components/Icons';

/**
 * The ONLY chip in the bottom-right corner: a new deploy is live, reload to get
 * it. There is deliberately no "What's new" chip — the update panel is one-shot
 * (see useProductUpdates), and the changelog lives at /release-notes.
 */
export function ProductUpdatesChip({ onRefresh }: { onRefresh: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-surface-card px-3 text-role-eyebrow font-semibold uppercase tracking-widest text-text-default hover:bg-surface-hover"
      onClick={onRefresh}
    >
      <RefreshCw className="h-3.5 w-3.5 text-text-accent" />
      New version — refresh
    </button>
  );
}
