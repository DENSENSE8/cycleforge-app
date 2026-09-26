'use client';

/** Testing Displays bodies — SKU Pairing · Checklist · Manuals. */

import { Loader2 } from '@/components/Icons';
import { ProductHubPanel } from '@/components/products/pairing/ProductHubPanel';
import { ChecklistSection } from '@/components/tech/sku-testing/ChecklistSection';
import { ManualsSection } from '@/components/tech/sku-testing/ManualsSection';
import {
  useSkuTestingData,
  type UseSkuTestingData,
} from '@/components/tech/sku-testing/useSkuTestingData';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Custom event the testing toolbar "Pair" action dispatches to jump to Pairing Displays. */
export const TESTING_OPEN_SKU_PAIRING_EVENT = 'testing-open-sku-pairing';

const FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));

/** Cross-platform SKU pairing hub for the Testing Pairing display. */
export function TestingSkuPairingPanel({
  skuCatalogId,
  headerTitle,
}: {
  skuCatalogId: number | null;
  headerTitle?: string | null;
}) {
  if (skuCatalogId == null) {
    return (
      <div className={FLUSH_HOST_CLASS}>
        <p className="border-b border-border-soft bg-surface-card px-3 py-3 text-center text-role-caption text-text-soft">
          This line has no catalog SKU yet — pair it to Zoho in receiving before
          cross-platform SKU pairing is available.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(FLUSH_HOST_CLASS, 'flex h-[28rem] min-h-0 flex-col overflow-hidden')}>
      <ProductHubPanel
        skuCatalogId={skuCatalogId}
        allowManualPair
        headerTitle={headerTitle}
      />
    </div>
  );
}

function TestingSkuLoadingRow() {
  return (
    <div
      className={cn(
        FLUSH_HOST_CLASS,
        'flex items-center gap-2 border-b border-border-soft bg-surface-card px-3 py-3 text-role-caption text-text-faint',
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" /> Loading testing details…
    </div>
  );
}

/** Per-SKU testing checklist body — parent shares one `useSkuTestingData` instance. */
export function TestingSkuChecklistPanel({
  receivingLineId,
  serialUnitId,
  data,
}: {
  receivingLineId: number;
  serialUnitId: number | null;
  data: UseSkuTestingData;
}) {
  const { bundle, loading, results, canRecord, loadBundle, loadResults, onResultChange } = data;

  if (loading) return <TestingSkuLoadingRow />;
  if (!bundle) return null;

  return (
    <div className={FLUSH_HOST_CLASS}>
      <ChecklistSection
        embedded
        receivingLineId={receivingLineId}
        bundle={bundle}
        results={results}
        canRecord={canRecord}
        serialUnitId={serialUnitId}
        onChanged={loadBundle}
        onReloadResults={loadResults}
        onResultChange={onResultChange}
      />
    </div>
  );
}

/** Per-SKU manuals body — parent shares one `useSkuTestingData` instance. */
export function TestingSkuManualsPanel({
  receivingLineId,
  data,
}: {
  receivingLineId: number;
  data: UseSkuTestingData;
}) {
  const { bundle, loading, loadBundle } = data;

  if (loading) return <TestingSkuLoadingRow />;
  if (!bundle) return null;

  return (
    <div className={FLUSH_HOST_CLASS}>
      <ManualsSection
        embedded
        receivingLineId={receivingLineId}
        bundle={bundle}
        onChanged={loadBundle}
      />
    </div>
  );
}

export { useSkuTestingData };
