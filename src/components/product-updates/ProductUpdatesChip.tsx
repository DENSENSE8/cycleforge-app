'use client';

import { RefreshCw } from '@/components/Icons';

const CHIP =
  'inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-surface-card px-3 text-role-eyebrow font-semibold uppercase tracking-widest text-text-default hover:bg-surface-hover';

export function ProductUpdatesChip({
  staleDeploy,
  onOpen,
  onRefresh,
}: {
  staleDeploy: boolean;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  if (staleDeploy) {
    return (
      <button type="button" className={CHIP} onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5 text-text-accent" />
        New version — refresh
      </button>
    );
  }

  return (
    <button type="button" className={CHIP} onClick={onOpen}>
      What&apos;s new
    </button>
  );
}
