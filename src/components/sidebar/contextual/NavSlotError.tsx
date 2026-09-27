'use client';

import { Button } from '@/design-system/primitives';

/** One slot failed; the rest of the sidebar keeps working. */
export function NavSlotError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-2 px-2.5 py-2">
      <span className="min-w-0 truncate text-role-caption text-text-muted">{label}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
