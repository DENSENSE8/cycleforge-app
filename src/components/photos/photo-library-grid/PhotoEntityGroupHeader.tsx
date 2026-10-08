'use client';

/**
 * Google Photos–style entity band — one title per PO / ticket group, with
 * select-all. Titles live here only; tiles stay label-free so the same PO is
 * not painted on every card.
 *
 * One line: [select] [ticket glyph] identifier · count … [trailing] date & time,
 * inset from the right edge so the trailing controls never touch it.
 * Ticket groups lead with the house ticket glyph so a claims ticket reads as a
 * ticket at a glance; PO / order bands stay glyph-free.
 */

import type { ReactNode } from 'react';
import { Ticket } from '@/components/Icons';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';
import { GroupSelectionMark } from './GroupSelectionMark';
import type { PhotoGroupKind } from './photo-grid-format';
import { PHOTO_ENTITY_GROUP_HEADER_PL } from './SelectionMark';

export function PhotoEntityGroupHeader({
  title,
  kind,
  dateLabel,
  count,
  allSelected,
  someSelected,
  onToggleSelectAll,
  trailing,
  sticky = true,
}: {
  title: string;
  kind: PhotoGroupKind;
  /** PST capture date and time (or span) — sits at the far right of the row. */
  dateLabel: string;
  count: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll?: () => void;
  /** Row control (claims Sync to NAS) — rides just left of the date. */
  trailing?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      data-testid="photo-entity-group-header"
      data-group-kind={kind}
      className={cn(
        // pl-2 matches SelectionMark's left-2 so the band select-all sits on the
        // same vertical line as the tile hover check.
        'flex min-w-0 items-center gap-2 whitespace-nowrap bg-surface-card py-2 pr-3',
        PHOTO_ENTITY_GROUP_HEADER_PL,
        sticky && 'sticky top-0',
      )}
      style={sticky ? { zIndex: zIndex.raised } : undefined}
    >
      {onToggleSelectAll ? (
        <GroupSelectionMark
          allSelected={allSelected}
          someSelected={someSelected}
          label={kind === 'ticket' ? `Ticket ${title}` : title}
          onToggle={onToggleSelectAll}
        />
      ) : null}
      {kind === 'ticket' ? (
        <Ticket className="h-4 w-4 shrink-0 text-orange-500" />
      ) : null}
      <h3 className="min-w-0 truncate text-role-body font-semibold text-text-default">
        {kind === 'ticket' ? <span className="sr-only">Ticket </span> : null}
        {title}
      </h3>
      <span className="shrink-0 text-role-caption tabular-nums text-text-soft">
        {count.toLocaleString()}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {trailing}
        {dateLabel ? (
          <span className="text-role-caption tabular-nums text-text-soft">{dateLabel}</span>
        ) : null}
      </span>
    </header>
  );
}
