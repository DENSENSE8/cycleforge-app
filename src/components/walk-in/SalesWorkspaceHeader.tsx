'use client';

/**
 * Sales workspace chrome — one unified header bar for the front-desk
 * transaction history, the sibling of `OutboundWorkspaceHeader`.
 *
 * Left:  category tabs (All · Sales · Pickups · Repairs) with live counts.
 * Right: the station deep-link, then the table-controls portal.
 *
 * Composes `WorkbenchChromeHeader` — never a page-local tab band.
 */

import { useMemo, type Ref } from 'react';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { Button } from '@/design-system/primitives';
import { ExternalLink } from '@/components/Icons';
import {
  WALK_IN_HISTORY_ITEMS,
  type WalkInHistoryCategory,
} from '@/lib/walk-in/history-categories';
import { TRANSACTION_KINDS } from '@/lib/walk-in/transaction-kind';

/** Tab tints resolve through the kind registry so a tab and its rows agree. */
const CATEGORY_COLOR: Record<WalkInHistoryCategory, 'blue' | 'emerald' | 'orange' | 'gray'> = {
  all: 'gray',
  sales: TRANSACTION_KINDS.sale.tabColor,
  pickups: TRANSACTION_KINDS.pickup.tabColor,
  repairs: TRANSACTION_KINDS.repair.tabColor,
};

interface SalesWorkspaceHeaderProps {
  category: WalkInHistoryCategory;
  onSelectCategory: (category: WalkInHistoryCategory) => void;
  /** Per-category row counts (from the merged feed). */
  counts: Record<WalkInHistoryCategory, number>;
  onOpenStation: () => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function SalesWorkspaceHeader({
  category,
  onSelectCategory,
  counts,
  onOpenStation,
  controlsSlotRef,
  className,
}: SalesWorkspaceHeaderProps) {
  const tabs = useMemo(
    () =>
      WALK_IN_HISTORY_ITEMS.map((item) => {
        const id = item.id as WalkInHistoryCategory;
        return { id, label: item.label, count: counts[id], color: CATEGORY_COLOR[id] };
      }),
    [counts],
  );

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={category}
      onTabChange={(id) => onSelectCategory(id as WalkInHistoryCategory)}
      controlsSlotRef={controlsSlotRef}
      className={className}
      right={
        <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={onOpenStation}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open station
        </Button>
      }
    />
  );
}
