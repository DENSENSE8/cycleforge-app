'use client';

import { Button } from '@/design-system/primitives';
import type { StationTheme } from '@/utils/staff-colors';
import { stationThemeColors } from '@/utils/staff-colors';

export function FbaErrorState({
  message,
  onRetry,
  theme,
}: {
  message: string;
  onRetry?: () => void;
  theme: StationTheme;
}) {
  const colors = stationThemeColors[theme];
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center bg-surface-canvas">
      <div className="max-w-sm rounded-none border border-red-200 bg-surface-card px-6 py-5 text-center shadow-sm shadow-red-100/70">
        <p className="text-sm font-semibold text-red-600">{message}</p>
        {onRetry ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className={`mt-4 border border-border-soft text-text-muted ${colors.hover} hover:border-transparent hover:text-white`}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
