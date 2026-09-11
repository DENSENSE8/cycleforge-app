'use client';

/**
 * `/search?sel=` body — FIND confirmation, not scan-station preview.
 */

import { Package } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { SearchOrderDossier } from '@/components/search/dossier/SearchOrderDossier';
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

  switch (sel.entityType) {
    case 'order':
      return <SearchOrderDossier orderId={sel.id} onBack={onBack} />;
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

