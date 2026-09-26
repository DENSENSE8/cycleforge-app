'use client';

/** The house DEGRADED state for a grid surface — the fourth settled state (loading → absence → no-match → **degraded**) that… */

import { RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

interface GridDegradedBoxProps {
  /** What could not load — kept short; the row is a recovery affordance, not a log. */
  message?: string;
  /** Re-run the failed fetch. */
  onRetry: () => void;
  retryLabel?: string;
}

export function GridDegradedBox({
  message = "Couldn't load — the request timed out or the server errored.",
  onRetry,
  retryLabel = 'Retry',
}: GridDegradedBoxProps) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-xs rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center"
    >
      <p className="text-sm font-semibold text-rose-700">{message}</p>
      <div className="mt-3 flex justify-center">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onRetry}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
