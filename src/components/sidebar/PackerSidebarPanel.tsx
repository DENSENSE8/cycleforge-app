'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import StationPacking from '@/components/station/StationPacking';
import { PackRecentPacksRail } from '@/components/sidebar/packer/PackRecentPacksRail';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { AlertTriangle, Box, Boxes } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { useMasterNavEnabled } from '@/components/sidebar/master-nav';
import { useActiveStaffDirectory } from './hooks';

/** Pack modes the operator can switch between at the top of the sidebar. */
type PackMode = 'standard' | 'fragile' | 'multi';

const PACK_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'standard', label: 'Standard', icon: Box },
  { id: 'fragile',  label: 'Fragile', icon: AlertTriangle },
  { id: 'multi',    label: 'Multi-Item', icon: Boxes },
];

export function PackerSidebarPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffIdNum = user?.staffId ?? 0;
  const packerId = String(staffIdNum);
  const staffDirectory = useActiveStaffDirectory();
  const masterNavEnabled = useMasterNavEnabled();
  const [railFilter, setRailFilter] = useState('');

  // Pack mode — persisted via ?packMode= URL param so refresh/sharing preserves it.
  const rawMode = searchParams.get('packMode') ?? 'standard';
  const packMode: PackMode = rawMode === 'fragile' ? 'fragile' : rawMode === 'multi' ? 'multi' : 'standard';

  const setPackMode = (next: PackMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'standard') params.delete('packMode');
    else params.set('packMode', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard');
  };

  const packerMember = staffDirectory.find((m) => String(m.id) === packerId);
  const packerName = packerMember?.name || 'Packer';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mode rail — Standard / Fragile / Multi-Item. Hidden when the master-nav
          header mode cluster is the single L2 switcher. */}
      {!masterNavEnabled && (
        <div className={`shrink-0 border-b border-border-hairline ${SIDEBAR_GUTTER} py-1.5`}>
          <HorizontalButtonSlider
            items={PACK_MODE_ITEMS}
            value={packMode}
            onChange={(id) => setPackMode(id as PackMode)}
            variant="segmented"
            aria-label="Pack mode"
            className="w-full"
          />
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <StationPacking
          embedded
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
