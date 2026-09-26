'use client';

/**
 * Expand the desk stage from the table's own header row.
 * is where the operator asked for it (2026-08-30) and where it belongs:
 */

import { Maximize2, Minimize2 } from '@/components/Icons';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { DATA_TABLE_TOOLBAR_CORNER } from '@/design-system/tokens/radius';
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
        'transition-colors duration-100 ease-out',
        'text-text-muted hover:bg-surface-hover hover:text-text-default',
        DATA_TABLE_TOOLBAR_CORNER,
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
