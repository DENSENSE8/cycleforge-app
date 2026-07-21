'use client';

import { SidebarShell } from '@/components/layout/SidebarShell';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';

/**
 * Review station sidebar — slim chrome only. The primary map lives in the
 * Workbench table (`ReviewPackingTable` / `ReviewPairingTable`); mode pills are
 * SIDEBAR_PAGE_NAV. Optional staff filter stays here for table scoping.
 */
export function ReviewSidebarPanel() {
  return (
    <SidebarShell
      headerRows={[
        <div key="review-staff" className="flex items-center justify-end px-1">
          <StaffFilterButton />
        </div>,
      ]}
      bodyClassName="pb-6"
    >
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-sunken px-4 py-6 text-center text-role-caption font-semibold text-text-muted">
        Select a packed order in the table to review slip/box photos, or open Pairing to allocate a serial to an outbound line.
      </div>
    </SidebarShell>
  );
}
