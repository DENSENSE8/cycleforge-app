'use client';

/**
 * The Scan Station next-step bubble's content (operator 2026-10-07): the step
 * top-left (no underline — operator 2026-10-08), the location code bottom-left
 * (the rack / shelf linked to this Type, else "No location linked"). No arrow
 * (operator 2026-10-08); the bottom-right holds the host's `trailing` facts
 * (Unbox: what to check on a return). No motion, no subtitle. The bubble
 * itself (surface, radius, shadow) is the {@link StationContextBar} bubble
 * row's. `hoverAction` shows only while the bubble (`group/bubble`) is
 * hovered or holds focus.
 */

import type { ReactNode } from 'react';
import { BinChip } from '@/components/ui/CopyChip';
import type { StationNextAction, StationNextActionTone } from '@/lib/station/next-action/types';
import { useClaimStationHeadline } from '@/lib/station/next-action/headline-presence';
import { cn } from '@/utils/_cn';

const HEADLINE_TONE: Record<StationNextActionTone, string> = {
  default: 'text-text-default',
  warning: 'text-text-warning',
  danger: 'text-text-danger',
};

export function StationNextActionHeadline({
  action,
  hoverAction,
  trailing,
}: {
  action: StationNextAction;
  /** Revealed on hover / focus of the bubble (Unbox: link the rack for this Type). */
  hoverAction?: ReactNode;
  /** Bottom-right, on the destination's row — one line, so the bubble keeps its height. */
  trailing?: ReactNode;
}) {
  useClaimStationHeadline();
  const code = action.destination?.code ?? null;
  return (
    <div
      role="status"
      className="relative flex h-full min-w-0 flex-col justify-between gap-2"
      data-testid="station-next-action"
      data-kind={action.kind}
      data-tone={action.tone}
    >
      <p
        className={cn(
          'text-role-display font-semibold leading-snug',
          HEADLINE_TONE[action.tone],
        )}
      >
        {action.headline}
      </p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0" data-testid="station-next-action-destination">
          {code ? (
            <BinChip value={code} display={code} />
          ) : (
            <span className="text-role-caption text-text-muted">No location linked</span>
          )}
        </div>
        {trailing ? <div className="min-w-0 text-right">{trailing}</div> : null}
      </div>
      {hoverAction ? (
        <div className="pointer-events-none absolute right-0 top-0 opacity-0 transition-opacity duration-150 group-hover/bubble:pointer-events-auto group-hover/bubble:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          {hoverAction}
        </div>
      ) : null}
    </div>
  );
}
