'use client';

/**
 * Center Lock L2 host — a multi-field record form stacked on the desk stage.
 *
 * The slot table stays mounted underneath (sibling in a `relative` wrapper).
 * This overlay is the ONLY desk record plane for new work (law Q5). Forbidden:
 * viewport Dialog and inbound RightPaneOverlay forks.
 *
 * ## Two fills (same host — never a second component)
 *
 * - `fill="inset"` (default) — padded max-measure card over a visible scrim.
 *   Use for short row-detail peeks where the grid map still guides the eye.
 * - `fill="stage"` — **stage-filling L2**: opaque panel covers the entire
 *   `desk-page-stage` card edge-to-edge (same footprint as DataTable /
 *   `DESK_TABLE_SURFACE_CLASS`). No inset gutters, no `max-w-*` island, no
 *   floating popover silhouette. Table remains mounted underneath (Q5) but
 *   is fully covered. Reading measure stays inside the form body
 *   (`TriageScrollLayout` / section `max-w-4xl`), not on the shell.
 *
 * @see docs/warehouse-os/PLAN-center-lock.md
 * @see docs/warehouse-os/LAWS.md Q5
 */

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { useEscapeClose, useRegisterOverlay } from '@/design-system/hooks';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

export type DeskStageOverlayFill = 'inset' | 'stage';

export interface DeskStageOverlayProps {
  /** When false, renders nothing — table ground plane only. */
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Walk position, e.g. `3 of 12`. Omit when not queue-walking. */
  indexLabel?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  className?: string;
  /** Merged onto the panel shell. */
  cardClassName?: string;
  /**
   * When false, the scrim is inert (Esc / header ✕ still close). Use for
   * draft sessions where a stray click must not eat a half-typed form.
   * Default true. Ignored visually when `fill="stage"` (panel is opaque).
   */
  closeOnScrim?: boolean;
  /**
   * `inset` — centered max-measure card (default).
   * `stage` — full width + height of the desk stage card (inline L2).
   */
  fill?: DeskStageOverlayFill;
}

export function DeskStageOverlay({
  open,
  onClose,
  title,
  subtitle,
  indexLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  children,
  footer,
  testId = 'desk-stage-overlay',
  className,
  cardClassName,
  closeOnScrim = true,
  fill = 'inset',
}: DeskStageOverlayProps) {
  useRegisterOverlay(open);
  useEscapeClose(open, onClose);

  if (!open) return null;

  const stageFill = fill === 'stage';

  return (
    <div
      className={cn(
        'absolute inset-0 flex min-h-0 overflow-hidden',
        stageFill
          ? 'flex-col items-stretch justify-stretch p-0'
          : 'items-stretch justify-center p-3 sm:p-4',
        className,
      )}
      style={{ zIndex: zIndex.panel }}
      data-testid={testId}
      data-desk-stage-fill={fill}
      role="region"
      aria-label={typeof title === 'string' ? title : 'Record editor'}
    >
      {/* Scrim — opacity only (M2); table remains mounted underneath (Q5). */}
      <button
        type="button"
        className={cn(
          'absolute inset-0',
          stageFill ? 'bg-surface-card' : 'bg-scrim/40',
        )}
        aria-label={closeOnScrim && !stageFill ? 'Close record editor' : undefined}
        aria-hidden={stageFill || !closeOnScrim}
        onClick={closeOnScrim && !stageFill ? onClose : undefined}
        tabIndex={-1}
      />

      <div
        className={cn(
          'relative z-raised flex min-h-0 flex-col overflow-hidden bg-surface-card',
          stageFill
            ? // Inside DESK_CHROME_STAGE_BODY — flush like DataTable (DESK_TABLE_SURFACE_CLASS).
              cn('h-full w-full max-w-none border-0', cornerClass('flush'), elevationClass('flat'))
            : cn(
                'w-full max-w-3xl border border-border-default',
                cornerClass('surface'),
                elevationClass('overlay'),
              ),
          cardClassName,
        )}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-border-hairline px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-role-title text-text-default">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-role-caption text-text-soft">{subtitle}</p>
            ) : null}
          </div>
          {indexLabel ? (
            <span className="shrink-0 tabular-nums text-role-caption text-text-muted">
              {indexLabel}
            </span>
          ) : null}
          {(onPrev || onNext) && (
            <div className="flex shrink-0 items-center gap-0.5">
              {onPrev ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Previous record"
                  onClick={onPrev}
                  disabled={prevDisabled}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              ) : null}
              {onNext ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Next record"
                  onClick={onNext}
                  disabled={nextDisabled}
                >
                  <ChevronRight className="size-4" />
                </Button>
              ) : null}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        {footer ? (
          <footer className="shrink-0 border-t border-border-hairline px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
