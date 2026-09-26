'use client';

/** Displays nav cluster — history `← →` + **current title** (+ optional trailing perspective segment, e.g. */

import { useCallback, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { DisplaysBreadcrumbSegment } from './displays-leaf-chrome';

/**
 * History Back — re-enable hits on the pointer-events-none band. Enabled ink is
 * `text-text-default`; the disabled face (`opacity-30` + soft) now only shows
 * at the very start of a session, since the forward twin is gone.
 */
const HISTORY_BTN =
  'pointer-events-auto inline-flex h-full w-7 shrink-0 items-center justify-center ' +
  'text-text-default hover:bg-surface-sunken ' +
  'disabled:pointer-events-none disabled:opacity-30 disabled:text-text-soft ' +
  `${focusRing('control', 'accent')} outline-none`;

export function StationDisplayLeafHeader({
  title,
  segments,
  onBack,
  onForward,
  backLabel = 'Back to Displays',
  forwardLabel = 'Forward',
  canGoBack = true,
  canGoForward = false,
  trailing = null,
}: {
  /** Legacy single-segment alias — prefer {@link segments}. */
  title?: string;
  /** Trail (min 1). Last segment is the painted title. */
  segments?: DisplaysBreadcrumbSegment[];
  onBack: () => void;
  /** Visit / nested Forward — omitted when the host has no forward stack. */
  onForward?: () => void;
  /** Tooltip / aria for the Back chevron + ArrowLeft. */
  backLabel?: string;
  forwardLabel?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /**
   * Leaf-wide child perspective (Claim New·Link). End of the same h-6 band —
   * never a second sticky row.
   */
  trailing?: ReactNode;
}) {
  const trail: DisplaysBreadcrumbSegment[] =
    segments && segments.length > 0
      ? segments
      : title
        ? [{ id: 'leaf', label: title }]
        : [];

  const current = trail.length > 0 ? trail[trail.length - 1]! : null;

  const onBandKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') {
        if (!canGoBack) return;
        e.preventDefault();
        e.stopPropagation();
        onBack();
        return;
      }
      if (e.key === 'ArrowRight') {
        if (!canGoForward || !onForward) return;
        e.preventDefault();
        e.stopPropagation();
        onForward();
      }
    },
    [canGoBack, canGoForward, onBack, onForward],
  );

  return (
    <div
      role="toolbar"
      aria-label="Displays navigation"
      tabIndex={0}
      onKeyDown={onBandKeyDown}
      className={cn(
        // LEFT group of the column's single header band.
        'pointer-events-none flex h-full min-w-0 flex-1 items-stretch',
        focusRing('control', 'accent'),
        'outline-none',
      )}
      data-station-displays-leaf-header=""
      data-breadcrumb-depth={trail.length}
      data-testid="station-displays-leaf-nav"
    >
      {/* Back is the LEADING-most cell of the band (2026-08-19) — no `ml-1` inset and no trailing hairline. */}
      <HoverTooltip label={backLabel} asChild>
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label={backLabel}
          className={HISTORY_BTN}
          data-testid="station-displays-history-back"
          data-station-displays-back=""
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </HoverTooltip>

      <div
        className="flex min-w-0 flex-1 items-stretch"
        data-station-displays-breadcrumb=""
      >
        {current ? (
          <span
            className="flex h-full min-w-0 flex-1 items-center truncate pl-1.5 pr-1.5 text-left text-role-caption font-semibold leading-4 text-text-default"
            data-station-displays-leaf-title=""
            data-testid="station-displays-leaf-title"
            data-breadcrumb-segment={current.id}
            data-breadcrumb-kind="current"
            aria-current="page"
          >
            {current.label}
          </span>
        ) : null}
      </div>

      {trailing != null ? (
        <div
          className="pointer-events-auto flex h-full shrink-0 items-stretch py-0 pr-0.5"
          data-station-displays-leaf-trailing=""
          data-testid="station-displays-leaf-trailing"
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
