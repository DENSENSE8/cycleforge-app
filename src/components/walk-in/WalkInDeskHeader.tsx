'use client';

/**
 * Sales-hub top-header — the per-mode tab band (Local Pickup: Draft/Completed ·
 * Sales: Today/All · Repair: Incoming/Active/Done). Sibling of
 * `OutboundWorkspaceHeader`; composes `WorkbenchChromeHeader` — never a
 * page-local tab band.
 *
 * Master-SoT styling: `solidTone="accent"` gives the active pill the operator's
 * staff-theme color, and every non-first tab carries a `dividerBefore` hairline.
 */

import { type Ref } from 'react';
import { Button } from '@/design-system/primitives';
import { ExternalLink } from '@/components/Icons';
import type { WalkInModeTab } from '@/lib/walk-in/history-modes';

interface WalkInDeskHeaderProps {
  tabs: WalkInModeTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onOpenStation: () => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function WalkInDeskHeader({
  tabs,
  activeTab,
  onSelectTab,
  onOpenStation,
  controlsSlotRef,
  className,
}: WalkInDeskHeaderProps) {
  // A hairline between every tab (requirement): divider before each non-first tab.
  const tabItems = tabs.map((tab, index) => ({
    id: tab.id,
    label: tab.label,
    dividerBefore: index > 0,
  }));

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabItems}
      activeTab={activeTab}
      onTabChange={onSelectTab}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      className={className}
      right={
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
      }
    />
  );
}
