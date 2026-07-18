'use client';

import { SidebarShell } from '@/components/layout/SidebarShell';
import { LabelsRecentRail } from '@/components/outbound/labels/LabelsRecentRail';
import { LabelsScanBand } from '@/components/outbound/labels/LabelsScanBand';

/**
 * Labels mode sidebar — station scan band (open order by scan) + the
 * "Labels printed" recent rail. Search, sort, Import, and lane filters live in
 * the labels-station header; this rail is glanceable context.
 */
export function LabelsModeBody() {
  return (
    <SidebarShell
      headerAbove={<LabelsScanBand />}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <LabelsRecentRail />
    </SidebarShell>
  );
}
