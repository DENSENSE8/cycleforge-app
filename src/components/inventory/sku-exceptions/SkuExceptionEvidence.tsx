'use client';

/**
 * SKU Exceptions — the evidence column beside the ledger (triage evidence
 * stack, BRIEF §4): what it is (the placeholder SKU, its state and next step)
 * → evidence (photos, product, facts, where it sits and how many) → the
 * decision bar (Add photo · Count · Pair · Share link, keys 1–4, the next
 * step's verb ink-filled).
 *
 * Nothing open, it reads the queue as a whole (held · no photo · unlocated ·
 * units on hold) so the column is never a blank panel.
 */

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
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { skuExceptionShareUrl } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSku, ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { shareRecordLink } from '@/lib/share-link';
import { cn } from '@/utils/_cn';
import { skuExceptionNextStep, skuExceptionTitle } from './sku-exception-record';
import { SkuExceptionLocationsSection, SkuExceptionProductSection } from './SkuExceptionEvidenceSections';
import { SkuExceptionPairSection } from './SkuExceptionPairSection';
import { SkuExceptionPhotosSection } from './SkuExceptionPhotosSection';

export interface SkuExceptionEvidenceProps {
  /** `?sku=` — the record the URL names, or null. */
  sku: string | null;
  item: ProvisionalSkuDetail | null | undefined;
  loading: boolean;
  error: unknown;
  /** The real SKU a paired placeholder became. */
  mergedInto: string | null;
  /** The queue — the summary face when nothing is open. */
  rows: readonly ProvisionalSku[];
  /** Leave the record (a completed pair lands here). */
  onExit: () => void;
}

export function SkuExceptionEvidence(props: SkuExceptionEvidenceProps) {
  const { sku, item, loading, error, mergedInto, rows } = props;
  if (!sku) return <SkuExceptionsSummary rows={rows} />;
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
      <EvidenceStateStrip state="onHold" next={next} />
      <SkuExceptionPhotosSection item={item} onChanged={refresh} fileRef={fileRef} />
      <SkuExceptionProductSection fieldId={fieldId} item={item} onChanged={refresh} />
      <EvidenceSection label="Facts">
        <EvidenceFacts>
          <EvidenceFact label="Barcode">
            <CopyChip value={item.barcode} display={item.barcode} tone="id" fitDisplayWidth />
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

/** Nothing open: the queue read as the floor reads it. */
function SkuExceptionsSummary({ rows }: { rows: readonly ProvisionalSku[] }) {
  const summary = useMemo(() => {
    let noPhoto = 0;
    let unlocated = 0;
    let units = 0;
    for (const row of rows) {
      if (row.photoCount === 0) noPhoto += 1;
      if (row.locations.length === 0) unlocated += 1;
      units += row.stock;
    }
    return [
      { code: 'HLD', label: 'On hold', value: rows.length, warn: false },
      { code: 'PHOTO', label: 'No photo', value: noPhoto, warn: noPhoto > 0 },
      { code: 'NO BIN', label: 'Unassigned location', value: unlocated, warn: unlocated > 0 },
      { code: 'UNITS', label: 'Units on hold', value: units, warn: false },
    ];
  }, [rows]);

  return (
    <>
      <EvidenceTitle>—</EvidenceTitle>
      <EvidenceSection label="No exception selected">
        <dl className="flex flex-col" data-testid="sku-exceptions-summary">
          {summary.map((line) => (
            <div key={line.code} className="flex items-center gap-3 border-b border-mode-rule py-1.5 last:border-b-0">
              <dt className={cn(RECORD_LABEL_CLASS, 'w-14 shrink-0 text-mode-muted')}>{line.code}</dt>
              <dd className={cn(RECORD_LABEL_CLASS, 'flex-1', line.warn ? 'text-mode-warn' : 'text-mode-ink')}>
                {line.label}
              </dd>
              <dd className="font-mono text-role-data font-bold tabular-nums text-mode-ink">{line.value}</dd>
            </div>
          ))}
        </dl>
      </EvidenceSection>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-rule px-4 py-2 text-mode-muted')}>
        Open a record · J / K step · Esc closes
      </p>
    </>
  );
}
