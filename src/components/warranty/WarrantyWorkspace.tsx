'use client';

import { useSearchParams } from 'next/navigation';
import { WarrantyClaimsTable } from '@/components/warranty/WarrantyClaimsTable';
import { WarrantyClaimDetailPanel } from '@/components/warranty/WarrantyClaimDetailPanel';
import { WarrantyCoverageCard } from '@/components/warranty/WarrantyCoverageCard';
import { useWarrantyUrlState } from '@/hooks/useWarrantyClaims';

/**
 * Right-pane workspace for Support › Warranty mode (`/support?mode=warranty`):
 * a coverage-lookup card (the "is this order under warranty?" phone-support
 * check) above the claims table. Self-contained so the support page only
 * switches one component in.
 *
 * The claim inspector is a `RightRailHost` occupant (`detail:warranty`), so it
 * is NOT a child of this workspace — it registers itself and the host owns the
 * right edge. It used to be a private `w-[420px]` column mounted right here
 * inside an `AnimatePresence` keyed per claim; see `WarrantyClaimDetailPanel`
 * for what that cost.
 */
export function WarrantyWorkspace() {
  const { openClaimId, openClaim } = useWarrantyUrlState();
  const search = String(useSearchParams().get('search') || '').trim();
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <WarrantyCoverageCard query={search} />
        <WarrantyClaimsTable />
      </div>
      {openClaimId != null && (
        <WarrantyClaimDetailPanel
          key={openClaimId}
          claimId={openClaimId}
          onClose={() => openClaim(null)}
        />
      )}
    </>
  );
}
