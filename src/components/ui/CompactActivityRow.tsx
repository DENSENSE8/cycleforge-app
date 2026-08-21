'use client';

/**
 * Compact two-row activity face — **status mark · title · one fact · short age**.
 *
 * Staff scan order: what is it (title) → how far along / what state (meta) →
 * how stale (`4h` / `30m` / `3d` via {@link formatLaneAgeCompact}). Golden host:
 * station recent rails (`RailRow`). Portable host: GlobalHeader inbox
 * (`ActivityInboxPopover`).
 *
 * Distinct from {@link StackedRowIdentity} (title → typed `CopyChip` keys for
 * pickers / subjects / drill parents). This face is an **ops activity feed**:
 * one scannable fact on row 2, never a tone-pill parade, never `4 hrs ago`,
 * never a large kind glyph as the leading mark. Inbox tech-queue ready/return
 * rows may paint house `OrderIdChip` / `TrackingChip` via
 * {@link joinStackedIdentityKeys} on meta (identity SoT), not mono prose.
 *
 * Detail: `.claude/rules/source-of-truth.md` → Compact activity row.
 * Guard: `compact-activity-row.guard.test.ts`.
 */

import type { ReactNode } from 'react';
import {
  SIDEBAR_RAIL_DOT_TRACK,
  SIDEBAR_RAIL_TRAILING_TRACK_CLASS,
  SIDEBAR_SCAN_DOCK_LEADING_ROW,
} from '@/components/layout/header-shell';
import { formatLaneAgeCompact } from '@/utils/date';
import { cn } from '@/utils/_cn';

export function CompactActivityRow({
  leading,
  children,
  activityAt,
  ageText,
  showAgeColumn = true,
  actions,
  className,
}: {
  /** Status dot / edit checkbox — rides the shared rail dot track (`w-4`). */
  leading: ReactNode;
  /** Content stack — compose {@link RailRowBody} (title + one meta fact). */
  children: ReactNode;
  /**
   * Instant for the trailing age. Numbers are epoch ms (inbox `createdAt`).
   * Formats via {@link formatLaneAgeCompact} — never a prose relative string.
   */
  activityAt?: string | Date | number | null;
  /**
   * Pre-formatted age, overriding {@link activityAt}. Same COMPACT shape the
   * row's own formatter produces (`5m` · `3h` · `2d`) — still never `4 hrs ago`
   * — for a feed whose band runs longer than `formatLaneAgeCompact` reaches:
   * that one tops out in days, so a three-month-old header recent read `92d`.
   * Supply this only when your feed genuinely spans weeks; otherwise pass
   * `activityAt` and let the row format it, so every rail agrees.
   */
  ageText?: string | null;
  /** Keep the age column so titles do not jump when one row lacks a stamp. */
  showAgeColumn?: boolean;
  /**
   * Ephemeral row actions (dismiss · undo). Absolute over the age column on
   * hover — age stays the durable trailing mark; actions must not invent a
   * second permanent right column.
   */
  actions?: ReactNode;
  className?: string;
}) {
  const ageInput =
    activityAt == null || activityAt === ''
      ? null
      : typeof activityAt === 'number'
        ? new Date(activityAt)
        : activityAt;
  const age =
    ageText != null && ageText !== ''
      ? ageText
      : ageInput == null
        ? null
        : formatLaneAgeCompact(ageInput);

  return (
    <div
      className={cn('relative', SIDEBAR_SCAN_DOCK_LEADING_ROW, 'w-full', className)}
      data-compact-activity-row=""
    >
      <span className={cn(SIDEBAR_RAIL_DOT_TRACK, 'flex shrink-0 items-center justify-center')}>
        {leading}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {showAgeColumn ? (
        age != null ? (
          <span
            className={cn(
              SIDEBAR_RAIL_TRAILING_TRACK_CLASS,
              'self-center tabular-nums text-role-micro font-medium text-text-faint',
            )}
            data-compact-activity-age=""
          >
            {age}
          </span>
        ) : (
          // Keep the age column so titles do not jump when one row lacks activity.
          <span className={SIDEBAR_RAIL_TRAILING_TRACK_CLASS} aria-hidden />
        )
      ) : null}
      {actions != null ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center justify-end gap-0.5 pr-0.5',
            'opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100',
            'focus-within:pointer-events-auto focus-within:opacity-100',
            'bg-gradient-to-l from-surface-card via-surface-card/95 to-transparent pl-6',
            'group-hover:from-surface-hover group-hover:via-surface-hover/95',
          )}
          data-compact-activity-actions=""
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
