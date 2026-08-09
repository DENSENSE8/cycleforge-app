'use client';

/**
 * UnboxDockHost — simplified flush floor instrument (geometry first).
 *
 * Always paints a full-width two-band plane against the workbench column:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────┐  ← border-t
 * │  FULL h-11 CURRENT STEP ROW (wedge / CTA / settle CTA) │
 * ├─────────────────────────────────────────────────────────┤  ← hairline
 * │  ‹ step · change ›                        [progress %] │
 * └─────────────────────────────────────────────────────────┘
 * ```
 *
 * Never a content-sized chip. `w-full` is load-bearing — `inset-x-0` alone does
 * nothing on an in-flow flex child. Contextual yield (terminal vs capture) may
 * swap leading/trailing contents; the bands themselves stay mounted.
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
   * Grow Band 1 past fixed h-11 (classify editor). Notes mode also grows;
   * compact capture steps stay h-11.
   */
  expandBand?: boolean;
  /** Bottom-left under-row — step name + prev/next (always mounted). */
  stepContext: ReactNode;
  leading: ReactNode;
  notesEntry: ReactNode;
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
        STATION_COLUMN_FOOTER_SEAM_CLASS,
      )}
      data-unbox-dock
      data-unbox-dock-mode={mode}
      data-unbox-dock-expand={expandBand ? '1' : undefined}
    >
      {/* Band 1 — current step (full width). Notes / classify may grow past h-11. */}
      <div
        className={cn(
          'flex w-full min-w-0 flex-col',
          growBand ? 'min-h-0' : 'h-11',
        )}
        data-unbox-dock-shell
      >
        <div
          className={cn(
            'flex w-full min-w-0',
            growBand
              ? 'min-h-0 flex-col items-stretch'
              : 'h-11 items-center gap-2 px-2',
          )}
        >
          <div
            className={
              growBand
                ? cn(
                    'flex w-full min-w-0 flex-1 flex-col overflow-visible',
                    !notesOpen && expandBand ? 'px-2 py-1' : undefined,
                  )
                : 'flex h-11 min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden'
            }
          >
            {notesOpen ? notesEntry : leading}
          </div>
          {showNotesToggle || notesOpen ? (
            <div
              className={cn(
                'shrink-0',
                notesOpen ? 'flex items-start px-2 pt-1.5' : undefined,
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
            <div className="shrink-0" data-unbox-dock-terminal>
              {trailing}
            </div>
          ) : null}
        </div>
      </div>

      {/* Band 2 — step face (left) · progress (right). Always mounted. */}
      {!notesOpen ? (
        <div
          className={cn(
            STATION_COLUMN_FOOTER_BAND_FACE,
            'min-w-0 gap-2 px-2 leading-none',
          )}
          data-unbox-dock-progress
        >
          <div className="flex min-w-0 flex-1 items-center">{stepContext}</div>
          <div className="flex shrink-0 items-center justify-end [&_button]:h-6 [&_button]:w-6">
            {progress}
          </div>
        </div>
      ) : null}
    </div>
  );
}
