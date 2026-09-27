'use client';

/**
 * Expand the desk stage from the table's own header row.
 * is where the operator asked for it (2026-08-30) and where it belongs:
 *
 * The row carries the stage's ONE view state (owner 2026-09-26): the ⤢ toggle
 * flips In place ↔ Split, and — where the list can paint a floor face — a
 * Floor button beside it enters the industrial full canvas. In floor the row
 * shows only "Exit floor": the page header that would otherwise hold a way
 * out is not rendered.
 */

import { Maximize2, Minimize2, Warehouse } from '@/components/Icons';
import {
  DESK_FLOOR_SHORTCUT_HINT,
  DESK_SPLIT_SHORTCUT_HINT,
  useDeskStageOptional,
} from '@/design-system/components/DeskStageContext';
import { DATA_TABLE_TOOLBAR_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const TOOLBAR_BUTTON_CLASS = cn(
  'ds-raw-button inline-flex h-6 shrink-0 items-center justify-center',
  'transition-colors duration-100 ease-out',
  'text-text-muted hover:bg-surface-hover hover:text-text-default',
  DATA_TABLE_TOOLBAR_CORNER,
  focusRing('control'),
);

export function DataTableFullscreenToggle({ className }: { className?: string }) {
  const stage = useDeskStageOptional();
  if (!stage) return null;

  if (stage.view === 'floor') {
    return (
      <button
        type="button"
        onClick={stage.toggleFloor}
        aria-label="Exit floor view"
        title={`Exit floor (Esc or ${DESK_FLOOR_SHORTCUT_HINT})`}
        data-testid="desk-floor-exit"
        className={cn(TOOLBAR_BUTTON_CLASS, 'gap-1 px-1.5 text-role-caption', className)}
      >
        <Minimize2 className="h-3.5 w-3.5" aria-hidden />
        Exit floor
      </button>
    );
  }

  const split = stage.view === 'split';
  return (
    <>
      {stage.floorAvailable ? (
        <button
          type="button"
          onClick={stage.toggleFloor}
          aria-label="Floor view"
          title={`Floor view — the whole screen for rows (${DESK_FLOOR_SHORTCUT_HINT})`}
          data-testid="desk-floor-toggle"
          className={cn(TOOLBAR_BUTTON_CLASS, 'gap-1 px-1.5 text-role-caption', className)}
        >
          <Warehouse className="h-3.5 w-3.5" aria-hidden />
          Floor
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => stage.setView(split ? 'in-place' : 'split')}
        aria-pressed={split}
        aria-label={split ? 'Exit fullscreen' : 'Expand table to fullscreen'}
        title={`${split ? 'Exit fullscreen' : 'Expand table to fullscreen'} (${DESK_SPLIT_SHORTCUT_HINT})`}
        data-testid="desk-fullscreen-toggle"
        className={cn(TOOLBAR_BUTTON_CLASS, 'w-6', className)}
      >
        {split ? (
          <Minimize2 className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </>
  );
}
