'use client';

/**
 * SKU exception — the open placeholder SKU, placed by its host's record
 * plane, in the order record's grammar: one `RecordGroup` card per section.
 * Main (the work) = Pair to SKU → the host's item card → Product →
 * Locations. Stock hides the Pair group: its action strip opens the same
 * editor as a panel anchored under the Pair to SKU verb.
 */

import { useCallback, useId, type ReactNode } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { StockLocationsGroup } from '@/components/stock/StockLocationsGroup';
import { SkuExceptionBarcodeValue, SkuExceptionProductSection } from './SkuExceptionEvidenceSections';
import { SkuExceptionPairSection } from './SkuExceptionPairSection';
import { SkuExceptionPhotosSection } from './SkuExceptionPhotosSection';

/** Fact rows inside a group — the stock record's facts body. */
const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

export interface SkuExceptionEvidenceProps {
  /** `?sku=` — the record the URL names. */
  sku: string;
  item: ProvisionalSkuDetail | null | undefined;
  loading: boolean;
  error: unknown;
  /** The real SKU a paired placeholder became. */
  mergedInto: string | null;
  /** Leave the record (a completed pair lands here). */
  onExit: () => void;
  /** The host's item card (photo tile · title · SKU). */
  itemRow?: ReactNode;
  /** Stock records pair from their action strip's anchored panel, not an inline group. */
  hidePair?: boolean;
}

/** The work column. */
export function SkuExceptionEvidence(props: SkuExceptionEvidenceProps) {
  const { sku, item, loading, error, mergedInto } = props;
  if (item) {
    return (
      <SkuExceptionRecordEvidence
        key={item.sku}
        item={item}
        onExit={props.onExit}
        itemRow={props.itemRow}
        hidePair={props.hidePair}
      />
    );
  }
  return (
    <>
      {loading ? (
        <EvidenceNotice>Loading {sku}…</EvidenceNotice>
      ) : error ? (
        <EvidenceNotice tone="warn">
          {error instanceof Error ? error.message : 'Could not load'} {sku}.
        </EvidenceNotice>
      ) : mergedInto ? (
        <EvidenceNotice>
          <span data-testid="sku-exception-merged">
            Already paired to{' '}
            <Link
              href={`/inventory/sku/${encodeURIComponent(mergedInto)}`}
              className="font-mono font-bold underline underline-offset-2"
            >
              {mergedInto}
            </Link>
            .
          </span>
        </EvidenceNotice>
      ) : (
        <EvidenceNotice tone="warn">
          <span data-testid="sku-exception-missing">No SKU exception {sku}.</span>
        </EvidenceNotice>
      )}
    </>
  );
}

function useRefreshSkuExceptions() {
  const queryClient = useQueryClient();
  return useCallback(() => invalidateSkuExceptions(queryClient), [queryClient]);
}

function SkuExceptionRecordEvidence({
  item,
  onExit,
  itemRow,
  hidePair = false,
}: {
  item: ProvisionalSkuDetail;
  onExit: () => void;
  itemRow?: ReactNode;
  hidePair?: boolean;
}) {
  const fieldId = useId();
  const refresh = useRefreshSkuExceptions();
  // Leave first: the record no longer exists once the merge lands.
  const paired = useCallback(async () => {
    onExit();
    await refresh();
  }, [onExit, refresh]);

  const pairRow = hidePair ? null : <SkuExceptionPairSection item={item} onPaired={paired} />;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="sku-exception-evidence">
      {pairRow}
      {itemRow}
      <SkuExceptionProductSection fieldId={fieldId} item={item} onChanged={refresh} />
      <StockLocationsGroup sku={item.sku} onChanged={refresh} />
    </div>
  );
}

/** The facts column: Photos (when any) → Details (barcode, who made it). */
export function SkuExceptionFacts({ item }: { item: ProvisionalSkuDetail }) {
  const fieldId = useId();
  const refresh = useRefreshSkuExceptions();
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const createdFace = created && !Number.isNaN(created.getTime()) ? format(created, 'MMM d · h:mm a') : null;

  return (
    <>
      <SkuExceptionPhotosSection photos={item.photos} stockId={item.stockId} onChanged={refresh} />
      <RecordGroup title="Details" testId="sku-exception-details">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Barcode" wide={!item.barcode}>
            <SkuExceptionBarcodeValue fieldId={fieldId} item={item} onChanged={refresh} />
          </EvidenceFactRow>
          <EvidenceFactRow label="Created">{[item.createdByName, createdFace].filter(Boolean).join(' · ') || '—'}</EvidenceFactRow>
        </div>
      </RecordGroup>
    </>
  );
}
