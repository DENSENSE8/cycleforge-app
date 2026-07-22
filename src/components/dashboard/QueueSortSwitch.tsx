'use client';

/**
 * Compact TOP sort switcher — Priority | Newest | Deadline.
 * Used by Pending (To Ship) and Testing chrome to reorder the same table
 * without swimlanes or Board|Grid chrome.
 */

import { useMemo } from 'react';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  QUEUE_DISPLAY_SORT_OPTIONS,
  type QueueDisplaySort,
} from '@/utils/queue-display-sort';
import { cn } from '@/utils/_cn';

export function QueueSortSwitch({
  sort,
  onChange,
  className,
}: {
  sort: QueueDisplaySort;
  onChange: (next: QueueDisplaySort) => void;
  className?: string;
}) {
  const tabs = useMemo(
    () =>
      QUEUE_DISPLAY_SORT_OPTIONS.map((o) => ({
        id: o.id,
        label: o.shortLabel,
        color: 'blue' as const,
      })),
    [],
  );

  return (
    <div className={cn('min-w-0 shrink', className)} data-queue-sort-switch="">
      <TabSwitch
        tabs={tabs}
        activeTab={sort}
        onTabChange={(id) => onChange(id as QueueDisplaySort)}
        variant="solid"
        solidTone="accent"
        countStyle="plain"
      />
    </div>
  );
}
