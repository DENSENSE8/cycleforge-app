'use client';

/**
 * Inventory › Stock — the evidence column beside the ledger (triage evidence
 * stack): what it is (the shelf, the product, its state) → evidence (photo,
 * facts) → the count at THIS location and the decision bar (Count · Open SKU ·
 * SKU exception for a placeholder).
 *
 * Nothing open, it reads the list as a whole (pairs · units · on hold · out of
 * stock · rooms).
 */

import { useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ExternalLink, Hash, Package } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import {
  EvidenceCountStepper,
  EvidenceDecisionBar,
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  EvidenceTitle,
  type EvidenceVerb,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { recordInitials } from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { useAuth } from '@/contexts/AuthContext';
import { commitStockRequest, stockAdjustRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { skuExceptionHref } from '@/lib/inventory/sku-exception-links';
import {
  locationStockRowId,
  type LocationStockRoomFacet,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { cn } from '@/utils/_cn';
import {
  stockLocationFace,
  stockRecordCountable,
  stockRecordState,
  stockRecordTitle,
} from './stock-record';

const COUNT_INPUT_ID = 'stock-evidence-count';

function stamp(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : format(at, 'MMM d, yyyy · h:mm a');
}

export function StockEvidence({
  openKey,
  record,
  rows,
  rooms,
  onCounted,
}: {
  openKey: string | null;
  /** The open pair (live row), or null. */
  record: LocationStockTableRow | null;
  rows: readonly LocationStockTableRow[];
  rooms: readonly LocationStockRoomFacet[];
  /** A count landed — re-read the loader. */
  onCounted: () => void;
}) {
  if (record) return <StockRecordEvidence key={locationStockRowId(record)} record={record} onCounted={onCounted} />;
  if (openKey) {
    return (
      <>
        <EvidenceTitle>—</EvidenceTitle>
        <EvidenceNotice tone="warn">
          <span data-testid="stock-evidence-missing">That stock pair is not in this list any more.</span>
        </EvidenceNotice>
      </>
    );
  }
  return <StockSummary rows={rows} rooms={rooms} />;
}

function StockRecordEvidence({ record, onCounted }: { record: LocationStockTableRow; onCounted: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const state = stockRecordState(record);
  const face = stockLocationFace(record);
  const title = stockRecordTitle(record);
  const countable = stockRecordCountable(record);
  const placeholder = state === 'onHold';

  const verbs = useMemo<EvidenceVerb[]>(() => {
    const out: EvidenceVerb[] = [];
    if (countable) {
      out.push({
        label: 'Count',
        icon: <Hash />,
        primary: true,
        onPress: () => document.getElementById(COUNT_INPUT_ID)?.focus(),
        testId: 'stock-verb-count',
      });
    }
    out.push({
      label: 'Open SKU',
      icon: <Package />,
      onPress: () => router.push(`/inventory/sku/${encodeURIComponent(record.sku)}`),
      testId: 'stock-verb-open-sku',
    });
    if (placeholder) {
      out.push({
        label: 'SKU exception',
        icon: <ExternalLink />,
        primary: !countable,
        onPress: () => router.push(skuExceptionHref(record.sku)),
        testId: 'stock-verb-exception',
      });
    }
    return out;
  }, [countable, placeholder, record.sku, router]);

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="stock-evidence">
      <EvidenceTitle sub={title}>{face ?? 'No location'}</EvidenceTitle>
      <EvidenceStateStrip state={state} next={countable ? 'Count' : placeholder ? 'Pair' : null} />
      <div className="relative aspect-[4/3] w-full border-b border-mode-rule bg-mode-well">
        {record.image_url ? (
          <Image src={record.image_url} alt="" fill unoptimized sizes="24vw" className="object-contain" />
        ) : (
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center font-mono text-role-title font-black text-mode-muted"
          >
            {recordInitials(title)}
          </span>
        )}
      </div>
      {countable && record.location_barcode ? (
        <EvidenceSection
          label="Count at this location"
          action={<span className={cn(RECORD_LABEL_CLASS, 'tabular-nums text-mode-ink')}>{record.qty} here</span>}
          testId="stock-evidence-count"
        >
          <EvidenceCountStepper
            inputId={COUNT_INPUT_ID}
            face={face ?? record.location_barcode}
            qty={record.qty}
            onCommit={async (delta) => {
              await commitStockRequest(
                stockAdjustRequest(
                  {
                    rowId: locationStockRowId(record),
                    barcode: record.location_barcode ?? '',
                    sku: record.sku,
                    qty: record.qty,
                    face: `${face ?? record.location_barcode} · ${record.sku}`,
                  },
                  { direction: delta > 0 ? 'in' : 'out', qty: Math.abs(delta), staffId },
                ),
              );
              onCounted();
            }}
          />
        </EvidenceSection>
      ) : null}
      <EvidenceSection label="Facts">
        <EvidenceFacts>
          <EvidenceFact label="SKU">
            <CopyChip value={record.sku} display={record.sku} tone="sku" fitDisplayWidth />
          </EvidenceFact>
          <EvidenceFact label="Location" mono>
            {face ?? '—'}
          </EvidenceFact>
          <EvidenceFact label="Room">{record.room ?? '—'}</EvidenceFact>
          <EvidenceFact label="Source">
            {record.source === 'bin' ? 'Bin count (loose stock)' : 'Serialized units'}
          </EvidenceFact>
          <EvidenceFact label="Quantity" mono>
            {record.qty}
          </EvidenceFact>
          <EvidenceFact label="Last moved">{stamp(record.last_moved) ?? '—'}</EvidenceFact>
          {record.source === 'bin' ? (
            <EvidenceFact label="Counted">{stamp(record.last_counted) ?? 'Never'}</EvidenceFact>
          ) : null}
        </EvidenceFacts>
      </EvidenceSection>
      {placeholder ? (
        <EvidenceNotice tone="warn">
          On hold — a floor-minted placeholder. Pair it to its Zoho item from the SKU exception.
        </EvidenceNotice>
      ) : null}
      <EvidenceDecisionBar verbs={verbs} />
    </div>
  );
}

/** Nothing open: the list read as the floor reads it. */
function StockSummary({
  rows,
  rooms,
}: {
  rows: readonly LocationStockTableRow[];
  rooms: readonly LocationStockRoomFacet[];
}) {
  const lines = useMemo(() => {
    let units = 0;
    let held = 0;
    let out = 0;
    for (const row of rows) {
      units += Math.max(row.qty, 0);
      const state = stockRecordState(row);
      if (state === 'onHold') held += 1;
      else if (state === 'outOfStock') out += 1;
    }
    return [
      { code: 'PAIRS', label: 'Location × SKU', value: rows.length, warn: false },
      { code: 'UNITS', label: 'On the shelves', value: units, warn: false },
      { code: 'HLD', label: 'On hold (TMP)', value: held, warn: held > 0 },
      { code: 'OOS', label: 'At or below zero', value: out, warn: out > 0 },
      { code: 'ROOMS', label: 'Rooms', value: rooms.length, warn: false },
    ];
  }, [rows, rooms.length]);

  return (
    <>
      <EvidenceTitle>—</EvidenceTitle>
      <EvidenceSection label="No stock pair selected">
        <dl className="flex flex-col" data-testid="stock-summary">
          {lines.map((line) => (
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
