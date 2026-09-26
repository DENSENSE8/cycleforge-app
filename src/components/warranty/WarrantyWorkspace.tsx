'use client';

import { useSearchParams } from 'next/navigation';
import { WarrantyClaimsTable } from '@/components/warranty/WarrantyClaimsTable';
import { WarrantyClaimDetailPanel } from '@/components/warranty/WarrantyClaimDetailPanel';
import { WarrantyCoverageCard } from '@/components/warranty/WarrantyCoverageCard';
import { useWarrantyUrlState } from '@/hooks/useWarrantyClaims';

/** Right-pane workspace for Support › Warranty mode (`/support?mode=warranty`): */
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
