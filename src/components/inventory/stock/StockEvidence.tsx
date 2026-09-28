'use client';

/**
 * Inventory › Stock — the open stock pair, on the order record's shape (owner
 * 2026-09-28, `remake-in-style`): left, the work — the Item (identity only),
 * then Count; right, the Location facts. Every group is one `RecordGroup`;
 * the pair's ONE status sits in the record header (`StockRecordStatus`).
 */

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Package } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { Button } from '@/design-system/primitives';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordPhoto } from '@/design-system/components/record-ledger/IndustrialRecord';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { EvidenceCountStepper, EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RECORD_FACT_KEY_CLASS, RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { STOCK_LIFECYCLE } from '@/design-system/tokens/stock-lifecycle';
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
  stockRecordNext,
  stockRecordState,
  stockRecordTitle,
} from './stock-record';

/** Fact rows inside a group — the carton record's facts body. */
const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

function stamp(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : format(at, 'MMM d, yyyy · h:mm a');
}

/** The pair's ONE status, top-right of the record header: its state and where it goes next. */
export function StockRecordStatus({ record }: { record: LocationStockTableRow }) {
  const state = STOCK_LIFECYCLE[stockRecordState(record)];
  const next = stockRecordNext(record);
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="stock-record-status">
      <LifecycleCode state={state} srLabel={null}>
        {state.code} · {state.label}
      </LifecycleCode>
      {next ? (
        <span className={cn(RECORD_LABEL_CLASS, 'hidden truncate text-mode-muted @md/record-head:inline')} data-testid="stock-record-next">
          {next}
        </span>
      ) : null}
    </span>
  );
}

export function StockEvidence({
  record,
  onCounted,
}: {
  /** The open pair (live row), or null when the link names a pair no longer listed. */
  record: LocationStockTableRow | null;
  /** A count landed — re-read the loader. */
  onCounted: () => void;
}) {
  if (record) return <StockRecordEvidence key={locationStockRowId(record)} record={record} onCounted={onCounted} />;
  return (
    <DeskRecordLayout
      main={
        <EvidenceNotice tone="warn">
          <span data-testid="stock-evidence-missing">That stock pair is not in this list any more.</span>
        </EvidenceNotice>
      }
    />
  );
}

function StockRecordEvidence({ record, onCounted }: { record: LocationStockTableRow; onCounted: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const face = stockLocationFace(record);
  const title = stockRecordTitle(record);
  const countable = stockRecordCountable(record);
  const placeholder = stockRecordState(record) === 'onHold';

  const main = (
    <div className="flex min-w-0 flex-col gap-4 industrial:gap-0">
      {/* A TMP- SKU the loader did not flag: it still cannot be sold by name — say so once, with its way out. */}
      {placeholder ? (
        <EvidenceNotice tone="warn">
          On hold — a floor-minted placeholder.{' '}
          <button
            type="button"
            onClick={() => router.push(skuExceptionHref(record.sku))}
            className="ds-raw-button underline underline-offset-2"
            data-testid="stock-verb-exception"
          >
            Pair it to its Zoho item
          </button>
        </EvidenceNotice>
      ) : null}
      <RecordGroup
        title="Item"
        titleHidden
        testId="stock-record-item"
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={<Package aria-hidden />}
            onClick={() => router.push(`/inventory/sku/${encodeURIComponent(record.sku)}`)}
            data-testid="stock-verb-open-sku"
          >
            Open SKU
          </Button>
        }
      >
        <article aria-label={title} className="flex gap-3 px-4 pb-3">
          <span className="relative h-28 w-28 shrink-0 overflow-hidden rounded-mode-control border border-mode-frame bg-mode-well">
            <RecordPhoto src={record.image_url} fallback={title} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-2 min-w-0 text-role-body font-bold" title={title}>
              {title}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-role-data">
              <span className="inline-flex items-center gap-1">
                <span className={RECORD_FACT_KEY_CLASS}>SKU </span>
                <CopyChip value={record.sku} display={record.sku} tone="sku" fitDisplayWidth />
              </span>
              <span data-testid="stock-record-qty">
                <span className={RECORD_FACT_KEY_CLASS}>Qty </span>
                <span className={cn(RECORD_ID_CLASS, record.qty > 0 ? 'text-mode-ink' : 'text-mode-warn')}>{record.qty}</span>
              </span>
              <span>
                <span className={RECORD_FACT_KEY_CLASS}>Held as </span>
                <span className="text-mode-ink">{record.source === 'bin' ? 'Bin count (loose stock)' : 'Serialized units'}</span>
              </span>
            </div>
          </div>
        </article>
      </RecordGroup>
      {countable && record.location_barcode ? (
        <RecordGroup title="Count at this location" testId="stock-evidence-count">
          <div className="px-4 pb-3">
            <EvidenceCountStepper
              inputId="stock-evidence-count"
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
          </div>
        </RecordGroup>
      ) : null}
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4 industrial:gap-0">
      <RecordGroup title="Location" testId="stock-record-location">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Bin">
            <span className={cn(RECORD_ID_CLASS, 'select-all', !face && 'text-mode-warn')}>{face ?? 'No location'}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Room">{record.room ?? '—'}</EvidenceFactRow>
          <EvidenceFactRow label="Last moved">{stamp(record.last_moved) ?? '—'}</EvidenceFactRow>
          {record.source === 'bin' ? (
            <EvidenceFactRow label="Counted">{stamp(record.last_counted) ?? 'Never'}</EvidenceFactRow>
          ) : null}
        </div>
      </RecordGroup>
    </div>
  );

  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink industrial:p-0" data-testid="stock-evidence">
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}

/** Nothing open: the list read as the floor reads it. */
export function stockSummary(
  rows: readonly LocationStockTableRow[],
  rooms: readonly LocationStockRoomFacet[],
): RecordLedgerSummary {
  let units = 0;
  let held = 0;
  let out = 0;
  for (const row of rows) {
    units += Math.max(row.qty, 0);
    const state = stockRecordState(row);
    if (state === 'onHold') held += 1;
    else if (state === 'outOfStock') out += 1;
  }
  return {
    title: 'Stock',
    facts: [
      { label: 'Location × SKU pairs', value: rows.length },
      { label: 'Units on the shelves', value: units, toolbar: true },
      { label: 'On hold (TMP)', value: held, warn: held > 0, toolbar: true },
      { label: 'At or below zero', value: out, warn: out > 0, toolbar: true },
      { label: 'Rooms', value: rooms.length },
    ],
  };
}
