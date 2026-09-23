'use client';

import { Button } from '@/design-system/primitives';
import type { StationTheme } from '@/utils/staff-colors';

export function FbaErrorState({
  message,
  onRetry,
  theme: _theme,
}: {
  message: string;
  onRetry?: () => void;
  theme: StationTheme;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center bg-surface-canvas">
      <div className="max-w-sm rounded-none border border-border-danger bg-surface-card px-6 py-5 text-center shadow-none">
        <p className="text-sm font-semibold text-text-danger">{message}</p>
        {onRetry ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="mt-4 border border-border-soft text-text-muted hover:bg-surface-hover hover:text-text-default"
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
