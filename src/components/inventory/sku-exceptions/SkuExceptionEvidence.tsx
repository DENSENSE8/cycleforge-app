'use client';

/** SKU Exceptions — the open placeholder SKU (triage evidence stack, BRIEF §4), placed by the ledger's `DeskRecordPlane`: */

import { useCallback, useId, useMemo, useRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Hash, Link2, Share2 } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import {
  EvidenceDecisionBar,
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  EvidenceTitle,
  type EvidenceVerb,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { lifecycleRecordState } from '@/design-system/tokens/lifecycle';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { skuExceptionShareUrl } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { shareRecordLink } from '@/lib/share-link';
import { skuExceptionNextStep, skuExceptionTitle } from './sku-exception-record';
import {
  SkuExceptionBarcodeValue,
  SkuExceptionLocationsSection,
  SkuExceptionProductSection,
} from './SkuExceptionEvidenceSections';
import { SkuExceptionPairSection } from './SkuExceptionPairSection';
import { SkuExceptionPhotosSection } from './SkuExceptionPhotosSection';

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
}

export function SkuExceptionEvidence(props: SkuExceptionEvidenceProps) {
  const { sku, item, loading, error, mergedInto } = props;
  if (item) return <SkuExceptionRecordEvidence key={item.sku} item={item} onExit={props.onExit} />;
  return (
    <>
      <EvidenceTitle>{sku}</EvidenceTitle>
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

function SkuExceptionRecordEvidence({ item, onExit }: { item: ProvisionalSkuDetail; onExit: () => void }) {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const title = skuExceptionTitle(item);
  const next = skuExceptionNextStep(item);

  const refresh = useCallback(() => invalidateSkuExceptions(queryClient), [queryClient]);
  // Leave first: the record no longer exists once the merge lands.
  const paired = useCallback(async () => {
    onExit();
    await refresh();
  }, [onExit, refresh]);

  const created = item.createdAt ? new Date(item.createdAt) : null;
  const createdFace =
    created && !Number.isNaN(created.getTime()) ? format(created, 'MMM d · h:mm a') : null;

  const verbs = useMemo<EvidenceVerb[]>(
    () => [
      {
        label: 'Add photo',
        icon: <Camera />,
        primary: next === 'Photo',
        onPress: () => fileRef.current?.click(),
        testId: 'sku-exception-verb-photo',
      },
      {
        label: 'Count',
        icon: <Hash />,
        primary: next === 'Count',
        onPress: () => {
          const input =
            document.getElementById(`${fieldId}-count`) ??
            document.querySelector<HTMLElement>('[data-testid="sku-exception-add-location"]');
          input?.scrollIntoView({ block: 'center' });
          input?.focus();
        },
        testId: 'sku-exception-verb-count',
      },
      {
        label: 'Pair',
        icon: <Link2 />,
        primary: next === 'Pair',
        onPress: () => {
          const trigger = document.getElementById(`${fieldId}-pair`);
          trigger?.scrollIntoView({ block: 'center' });
          trigger?.click();
        },
        testId: 'sku-exception-verb-pair',
      },
      {
        label: 'Share link',
        icon: <Share2 />,
        onPress: () => void shareRecordLink(skuExceptionShareUrl(item.sku), `SKU exception — ${title}`),
        testId: 'sku-exception-share',
      },
    ],
    [fieldId, item.sku, next, title],
  );

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="sku-exception-evidence">
      <EvidenceTitle sub={title}>{item.sku}</EvidenceTitle>
      <EvidenceStateStrip state={lifecycleRecordState('onHold')} next={next} />
      <SkuExceptionPhotosSection item={item} onChanged={refresh} fileRef={fileRef} />
      <SkuExceptionProductSection fieldId={fieldId} item={item} onChanged={refresh} />
      <EvidenceSection label="Facts">
        <EvidenceFacts>
          <EvidenceFact label="Barcode">
            <SkuExceptionBarcodeValue fieldId={fieldId} item={item} onChanged={refresh} />
          </EvidenceFact>
          <EvidenceFact label="SKU">
            <CopyChip value={item.sku} display={item.sku} tone="sku" fitDisplayWidth />
          </EvidenceFact>
          <EvidenceFact label="Created">
            {[item.createdByName, createdFace].filter(Boolean).join(' · ') || '—'}
          </EvidenceFact>
          <EvidenceFact label="On hand" mono>
            {item.stock}
          </EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <SkuExceptionLocationsSection fieldId={fieldId} item={item} onChanged={refresh} />
      <SkuExceptionPairSection fieldId={fieldId} item={item} onPaired={paired} />
      <EvidenceDecisionBar verbs={verbs} />
    </div>
  );
}
