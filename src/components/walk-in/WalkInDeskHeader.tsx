'use client';

/** Sales-hub top-header — the per-mode tab band (Local Pickup: */

import { Button } from '@/design-system/primitives';
import { ExternalLink } from '@/components/Icons';
import type { WalkInModeTab } from '@/lib/walk-in/history-modes';
import { TableTabs } from '@/components/tables/TableStatusBar';
import { cn } from '@/utils/_cn';

interface WalkInDeskHeaderProps {
  tabs: WalkInModeTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onOpenStation: () => void;
  className?: string;
}

export function WalkInDeskHeader({
  tabs,
  activeTab,
  onSelectTab,
  onOpenStation,
  className,
}: WalkInDeskHeaderProps) {
  const tabItems = tabs.map((tab) => ({ id: tab.id, label: tab.label }));

  return (
    <div
      className={cn(
        'flex min-w-0 items-stretch justify-between border-b border-border-soft bg-surface-card',
        className,
      )}
    >
      <TableTabs tabs={tabItems} activeTab={activeTab} onTabChange={onSelectTab} />
      <div className="flex shrink-0 items-center px-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={onOpenStation}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open station
        </Button>
      </div>
    </div>
  );
}
