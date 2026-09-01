'use client';

/**
 * Google Photos–style entity band — one title per PO / ticket group, with
 * select-all. Titles live here only; tiles stay label-free so the same PO is
 * not painted on every card.
 */

import type { ReactNode } from 'react';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';
import { GroupSelectionMark } from './GroupSelectionMark';
import { PHOTO_ENTITY_GROUP_HEADER_PL } from './SelectionMark';

export function PhotoEntityGroupHeader({
  title,
  count,
  allSelected,
  someSelected,
  onToggleSelectAll,
  trailing,
  sticky = true,
}: {
  title: string;
  count: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll?: () => void;
  trailing?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      data-testid="photo-entity-group-header"
      className={cn(
        // pl-2 matches SelectionMark's left-2 so the band select-all sits on the
        // same vertical line as the tile hover check.
        'flex min-w-0 items-center gap-2 bg-surface-card py-2 pr-0',
        PHOTO_ENTITY_GROUP_HEADER_PL,
        sticky && 'sticky top-0',
      )}
      style={sticky ? { zIndex: zIndex.raised } : undefined}
    >
      {onToggleSelectAll ? (
        <GroupSelectionMark
          allSelected={allSelected}
          someSelected={someSelected}
          label={title}
          onToggle={onToggleSelectAll}
        />
      ) : null}
      <h3 className="min-w-0 truncate text-role-body font-semibold text-text-default">
        {title}
      </h3>
      <span className="shrink-0 text-role-caption tabular-nums text-text-soft">
        {count.toLocaleString()}
      </span>
      {trailing}
    </header>
  );
}
