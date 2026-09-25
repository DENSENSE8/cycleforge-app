'use client';

/**
 * `/search?sel=` body — FIND confirmation, not scan-station preview. An ORDER
 * on the desk opens the triage order ledger (the on-the-phone lookup); the
 * phone keeps the compact dossier.
 */

import { Package } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { SearchOrderDossier } from '@/components/search/dossier/SearchOrderDossier';
import { SearchOrderLedger } from '@/components/search/dossier/SearchOrderLedger';
import { useFindDensity } from '@/components/search/find-density-context';
import { SearchUnitDossier } from '@/components/search/dossier/SearchUnitDossier';
import { SearchReceivingDossier } from '@/components/search/dossier/SearchReceivingDossier';
import { SearchSkuDossier, SearchStackDossier } from '@/components/search/dossier/SearchGenericDossier';
import type { SearchSelection } from '@/lib/search/search-selection';

export function SearchDossier({
  sel,
  hasQuery,
  onExit,
}: {
  sel: SearchSelection;
  hasQuery: boolean;
  onExit: () => void;
}) {
  const onBack = hasQuery ? onExit : undefined;
  const density = useFindDensity();

  switch (sel.entityType) {
    case 'order':
      return density === 'compact' ? (
        <SearchOrderDossier orderId={sel.id} onBack={onBack} />
      ) : (
        <SearchOrderLedger orderId={sel.id} />
      );
    case 'receiving':
      return <SearchReceivingDossier receivingId={sel.id} onBack={onBack} />;
    case 'unit':
      return <SearchUnitDossier unitRef={sel.id} onBack={onBack} />;
    case 'sku':
      return <SearchSkuDossier id={sel.id} onBack={onBack} />;
    case 'repair':
      return (
        <SearchStackDossier
          entityType="repair"
          id={sel.id}
          kind="claim"
          label="Repair"
          onBack={onBack}
        />
      );
    case 'fba':
      return (
        <SearchStackDossier
          entityType="fba"
          id={sel.id}
          kind="shipment"
          label="FBA"
          onBack={onBack}
        />
      );
    default:
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
          <EmptyState
            icon={<Package className="h-6 w-6 text-text-faint" />}
            title="Unknown selection"
            description="This selection does not name an entity search can open."
          />
        </div>
      );
  }
}

