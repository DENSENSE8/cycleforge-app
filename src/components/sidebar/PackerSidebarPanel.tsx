'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PackScanColumn from '@/components/station/PackScanColumn';
import { PackRecentPacksRail } from '@/components/sidebar/packer/PackRecentPacksRail';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveStaffDirectory } from './hooks';

/** Pack modes — set via ?packMode= URL (GlobalHeader L2 / SIDEBAR_PAGE_NAV). */
type PackMode = 'standard' | 'fragile' | 'multi';

export function PackerSidebarPanel() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffIdNum = user?.staffId ?? 0;
  const packerId = String(staffIdNum);
  const staffDirectory = useActiveStaffDirectory();
  const [railFilter, setRailFilter] = useState('');

  // Pack mode — persisted via ?packMode= URL param so refresh/sharing preserves it.
  const rawMode = searchParams.get('packMode') ?? 'standard';
  const packMode: PackMode = rawMode === 'fragile' ? 'fragile' : rawMode === 'multi' ? 'multi' : 'standard';

  const packerMember = staffDirectory.find((m) => String(m.id) === packerId);
  const packerName = packerMember?.name || 'Packer';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <PackScanColumn
          userId={packerId}
          userName={packerName}
          staffId={packerId}
          packMode={packMode}
          railSlot={<PackRecentPacksRail packerId={staffIdNum} filterText={railFilter} />}
          railFooter={
            <TechRailSearchBar
              value={railFilter}
              onChange={setRailFilter}
              placeholder="Filter recent packs…"
            />
          }
        />
      </div>
    </div>
  );
}
