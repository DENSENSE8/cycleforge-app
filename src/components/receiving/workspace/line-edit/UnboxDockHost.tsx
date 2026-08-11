'use client';

/**
 * UnboxDockHost — flush floor instrument (geometry first).
 *
 * Always paints a full-width two-band plane against the workbench column:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────┐  ← border-t
 * │  FULL h-11 CURRENT STEP ROW (wedge / CTA / settle CTA) │
 * ├─────────────────────────────────────────────────────────┤  ← hairline
 * │  ‹ LABEL · summary (LEFT) ………………… › │ [%] │   │
 * └─────────────────────────────────────────────────────────┘
 * ```
 *
 * Band 2: step text **most left**, progress ring **most right**, white
 * `bg-surface-card` on every step / phase. Never centered label chips.
 *
 * **Never a content-sized chip / floating pill in air.** `w-full` is
 * load-bearing. Both bands are edge-to-edge — host `p-0 gap-0`. Content pad
 * lives *inside* a full-height segment. Siblings **abut** (`items-stretch`).
 * Guard: `unbox-dock-one-shell.guard.test.ts`.
 */

import type { ReactNode } from 'react';
import { FileText } from '@/components/Icons';
import {
  STATION_COLUMN_FOOTER_BAND_FACE,
  STATION_COLUMN_FOOTER_SEAM_CLASS,
} from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

type UnboxDockMode = 'entry' | 'notes';

export function UnboxDockHost({
  mode,
  onOpenNotes,
  onCloseNotes,
  hasItemNote,
  showNotesToggle = true,
  expandBand = false,
  omitTopSeam = false,
  stepContext,
  leading,
  notesEntry,
  trailing,
  progress,
}: {
  mode: UnboxDockMode;
  onOpenNotes: () => void;
  onCloseNotes: () => void;
  hasItemNote: boolean;
  showNotesToggle?: boolean;
  /**
   * Grow Band 1 past fixed h-11. Notes mode grows; Unbox classify stays h-11
   * (Displays owns the editor). Arrival Staging may still pass true.
   */
  expandBand?: boolean;
  /**
   * When the dogfood Print · Receive strip sits above this host, skip the
   * top hairline so strip → Band 1 reads as one stacked plane.
   */
  omitTopSeam?: boolean;
  /** Bottom-left under-row — step name + prev/next (always mounted). */
  stepContext: ReactNode;
  leading: ReactNode;
  /** Band 1 notes escalate — unused when notes live on the dogfood top row. */
  notesEntry?: ReactNode;
  trailing: ReactNode;
  /** Bottom-right under-row — live procedure progress. */
  progress: ReactNode;
}) {
  const notesOpen = mode === 'notes';
  const growBand = notesOpen || expandBand;

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-0 bg-surface-card',
        !omitTopSeam && STATION_COLUMN_FOOTER_SEAM_CLASS,
      )}
      data-unbox-dock
      data-unbox-dock-mode={mode}
      data-unbox-dock-expand={expandBand ? '1' : undefined}
    >
      {/* Band 1 — current step (full width). Notes may grow; classify stays h-11. */}
      <div
        className={cn(
          'flex w-full min-w-0 flex-col',
          growBand ? 'min-h-0' : 'h-11',
        )}
        data-unbox-dock-shell
      >
        <div
          className={cn(
            'flex w-full min-w-0 gap-0',
            growBand
              ? 'min-h-0 flex-col items-stretch'
              : // Edge-to-edge Band 1 — host gap-0; segments abut full height.
                'h-11 items-stretch',
          )}
        >
          <div
            className={
              growBand
                ? cn(
                    'flex w-full min-w-0 flex-1 flex-col overflow-visible',
                    // Classify may need vertical air; never horizontal host gutters.
                    !notesOpen && expandBand ? 'py-1' : undefined,
                  )
                : 'flex h-11 min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden'
            }
          >
            {notesOpen ? notesEntry : leading}
          </div>
          {/* Notes toggle is optional on Band 1. Unbox dogfood owns it on the
              commit strip above the host (`data-unbox-dogfood-print`) so Band 1
              stays step studio / notes body only — never a second FileText. */}
          {showNotesToggle ? (
            <div
              className={cn(
                'flex shrink-0 items-stretch border-l border-border-hairline',
                notesOpen ? 'items-start pt-1.5' : undefined,
              )}
            >
              <HoverTooltip
                label={
                  notesOpen ? 'Close note' : hasItemNote ? 'Edit note' : 'Add note'
                }
                asChild
              >
                <IconButton
                  size="md"
                  tone={notesOpen || hasItemNote ? 'accent' : 'neutral'}
                  ariaLabel={
                    notesOpen ? 'Close note' : hasItemNote ? 'Edit note' : 'Add note'
                  }
                  aria-pressed={notesOpen}
                  icon={<FileText className="h-4 w-4" />}
                  onClick={notesOpen ? onCloseNotes : onOpenNotes}
                  data-unbox-notes-toggle
                />
              </HoverTooltip>
            </div>
          ) : null}
          {!notesOpen && trailing ? (
            <div
              className="flex shrink-0 items-stretch border-l border-border-hairline"
              data-unbox-dock-terminal
            >
              {trailing}
            </div>
          ) : null}
        </div>
      </div>

      {/* Band 2 — white floor: step text LEFT · progress ring RIGHT (every step). */}
      {!notesOpen ? (
        <div
          className={cn(
            STATION_COLUMN_FOOTER_BAND_FACE,
            // Edge-to-edge white Band 2 — gap-0 abut; never host air / center
            // float. No host `leading-none` — it clips caption descenders in
            // the step pager ("Shipping label").
            'min-w-0 gap-0 bg-surface-card',
          )}
          data-unbox-dock-progress
        >
          <div className="flex h-full min-w-0 flex-1 items-stretch bg-surface-card">
            {stepContext}
          </div>
          <div
            className="flex h-full w-8 shrink-0 items-stretch border-l border-border-hairline bg-surface-card"
            data-unbox-dock-progress-cell
          >
            {progress}
          </div>
        </div>
      ) : null}
    </div>
  );
}
