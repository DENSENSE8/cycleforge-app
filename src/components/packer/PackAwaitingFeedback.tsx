'use client';

import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Soft idle feedback for Pack Queue / History — not an error, not “empty”.
 * Operators are waiting on a scan or on recorded packs, not a failed load.
 */
export function PackAwaitingFeedback({ message }: { message: string }) {
  return (
    <div
      role="status"
      className={cn(
        'mx-auto max-w-xs border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center',
        cornerClass('surface'),
      )}
    >
      <p className="text-sm font-semibold text-text-soft">{message}</p>
    </div>
  );
}
