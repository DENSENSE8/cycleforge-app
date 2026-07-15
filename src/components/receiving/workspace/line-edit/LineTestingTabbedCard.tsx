'use client';

import { Loader2 } from '@/components/Icons';
import { ProductHubPanel } from '@/components/products/pairing/ProductHubPanel';
import { WorkspaceCard } from '@/design-system/components';
import { ChecklistSection } from '@/components/tech/sku-testing/ChecklistSection';
import { ManualsSection } from '@/components/tech/sku-testing/ManualsSection';
import {
  useSkuTestingData,
  type UseSkuTestingData,
} from '@/components/tech/sku-testing/useSkuTestingData';

/** Custom event the testing toolbar "Pair" action dispatches to jump to the pairing tab. */
export const TESTING_OPEN_SKU_PAIRING_EVENT = 'testing-open-sku-pairing';

const NOTES_TEXTAREA_FOCUS =
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/**
 * Operator notes composer for the testing workspace overview tab.
 * Distinct from unbox `LineNotesCard` — a simple auto-saving textarea.
 */
export function TestingNotesField({
  notes,
  onChange,
  onBlur,
}: {
  notes: string;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  return (
    <WorkspaceCard label="Notes" bodyClassName="p-4">
      <textarea
        rows={2}
        aria-label="Notes"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full resize-none rounded-lg border border-border-soft inset-field text-role-caption text-text-default ${NOTES_TEXTAREA_FOCUS}`}
      />
    </WorkspaceCard>
  );
}

/** Cross-platform SKU pairing hub for the testing workspace pairing tab. */
export function TestingSkuPairingPanel({
  skuCatalogId,
  headerTitle,
}: {
  skuCatalogId: number | null;
  headerTitle?: string | null;
}) {
  if (skuCatalogId == null) {
    return (
      <WorkspaceCard bodyClassName="p-4">
        <p className="rounded-lg border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-xs text-text-soft">
          This line has no catalog SKU yet — pair it to Zoho in receiving before
          cross-platform SKU pairing is available.
        </p>
      </WorkspaceCard>
    );
  }

  return (
    <WorkspaceCard overflow="visible" bodyClassName="p-0">
      <div className="flex h-[28rem] min-h-0 flex-col overflow-hidden rounded-2xl">
        <ProductHubPanel
          skuCatalogId={skuCatalogId}
          allowManualPair
          headerTitle={headerTitle}
        />
      </div>
    </WorkspaceCard>
  );
}

function TestingSkuLoadingCard() {
  return (
    <WorkspaceCard bodyClassName="p-4">
      <div className="flex items-center gap-2 py-4 text-role-caption text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading testing details…
      </div>
    </WorkspaceCard>
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

  if (loading) return <TestingSkuLoadingCard />;
  if (!bundle) return null;

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-4">
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
    </WorkspaceCard>
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

  if (loading) return <TestingSkuLoadingCard />;
  if (!bundle) return null;

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-4">
      <ManualsSection
        embedded
        receivingLineId={receivingLineId}
        bundle={bundle}
        onChanged={loadBundle}
      />
    </WorkspaceCard>
  );
}

export { useSkuTestingData };
