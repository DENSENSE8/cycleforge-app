'use client';

/**
 * Expand the desk stage from the table's own header row.
 *
 * Lives at the far right of {@link DataTable}'s find/filter/fields row, which
 * is where the operator asked for it (2026-08-30) and where it belongs:
 * fullscreen is a question about the TABLE — "I need more of this grid" — and
 * every other control that answers a question about the table is already on
 * that row. On the page's tab band it read as page chrome and cost a second
 * row of chrome above the first data row.
 *
 * Renders **nothing** when the table is not inside a desk stage
 * (`useDeskStageOptional() === null`) — a station embed or a modal-hosted table
 * has no stage to expand, and a dead control is worse than no control.
 */

import { Maximize2, Minimize2 } from '@/components/Icons';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function DataTableFullscreenToggle({ className }: { className?: string }) {
  const stage = useDeskStageOptional();
  if (!stage) return null;

  return (
    <button
      type="button"
      onClick={stage.toggleFullscreen}
      aria-pressed={stage.fullscreen}
      aria-label={stage.fullscreen ? 'Exit fullscreen' : 'Expand table to fullscreen'}
      title={stage.fullscreen ? 'Exit fullscreen' : 'Expand table to fullscreen'}
      data-testid="desk-fullscreen-toggle"
      className={cn(
        'ds-raw-button inline-flex h-6 w-6 shrink-0 items-center justify-center',
        'text-text-muted transition-colors duration-100 ease-out hover:bg-surface-hover hover:text-text-default',
        cornerClass('flush'),
        focusRing('control'),
        className,
      )}
    >
      {stage.fullscreen ? (
        <Minimize2 className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
