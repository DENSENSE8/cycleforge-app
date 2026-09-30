'use client';

/**
 * Inventory › Stock — the open stock pair, on the triage card's soft, rounded
 * face. The header reads the stock then the product title (`StockLedger`).
 * Main = the item card — the photo (Upload · Phone inside it while empty),
 * the SKU chip, then the pinned location line: room · the exact tote/bin
 * (copies its dashed face) · how it is held · the SKU's home tote (Pair tote /
 * Switch home tote, `StockPairBin`) — then **Locations**: every tote and bin
 * the SKU sits in, each countable, plus Add location (`StockLocationsGroup`).
 * A placeholder (`TMP-`) swaps main for its own work column (Pair to Zoho
 * first, this item card under it) and leads the aside with its own facts
 * (`placeholder`). Aside = [placeholder facts →] Send to staff → Movement.
 */

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { RecordTaskForm } from '@/components/tasks/RecordTaskActions';
import { CopyChip } from '@/components/ui/CopyChip';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { SkuOpenInMenu } from '@/design-system/components/record-ledger/RecordItemIdentity';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import {
  locationStockRowId,
  type LocationStockRoomFacet,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { cn } from '@/utils/_cn';
import { STOCK_SOURCE_LABEL, stockLocationFace, stockRecordState, stockRecordTitle } from './stock-record';
import { StockLocationsGroup } from './StockLocationsGroup';
import { StockPairBin } from './StockPairBin';
import { StockPhotoTile } from './StockPhotoTile';

/** Fact rows inside a group — the carton record's facts body. */
const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';
/** A soft triage pill (room, how it is held). */
const PILL_CLASS = 'inline-flex h-6 items-center rounded-full bg-surface-sunken px-2.5 text-xs font-medium text-text-default';

/** A `TMP-` placeholder's own record parts: its work column (handed this record's item card) and its facts. */
interface PlaceholderParts {
  main: (itemRow: ReactNode) => ReactNode;
  aside?: ReactNode;
}

function stamp(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : format(at, 'MMM d, yyyy · h:mm a');
}

export function StockEvidence({
  record,
  onCounted,
  placeholder,
}: {
  /** The open pair (live row), or null when the link names a pair no longer listed. */
  record: LocationStockTableRow | null;
  /** A count landed — re-read the loader. */
  onCounted: () => void;
  /** A `TMP-` placeholder's own record parts. */
  placeholder?: PlaceholderParts;
}) {
  if (record) return <StockRecordEvidence key={locationStockRowId(record)} record={record} onCounted={onCounted} placeholder={placeholder} />;
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

function StockRecordEvidence({
  record,
  onCounted,
  placeholder,
}: {
  record: LocationStockTableRow;
  onCounted: () => void;
  placeholder?: PlaceholderParts;
}) {
  const face = stockLocationFace(record);
  const title = stockRecordTitle(record);

  // The item: photo · SKU, then the pinned location line. Its count and title read in the record header.
  const itemBody = (
    <div className="flex min-w-0 items-start gap-4 px-4 py-3" data-testid="stock-record-item">
      <StockPhotoTile stockId={record.stock_id} sku={record.sku} photoUrl={record.image_url} title={title} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 items-center gap-1">
          <CopyChip value={record.sku} display={record.sku} tone="sku" fitDisplayWidth />
          <SkuOpenInMenu sku={record.sku} />
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="stock-record-location">
          <span className={cn(PILL_CLASS, !record.room && 'text-text-warning')}>{record.room ?? 'No room'}</span>
          {face ? (
            // The exact tote/bin: no glyph, and it copies the dashed face the floor reads (`C-02-01-2-00`).
            <CopyChip value={face} display={face} tone="bin" icon={null} width="w-fit max-w-full" />
          ) : (
            <span className={cn(PILL_CLASS, 'text-text-warning')}>No tote</span>
          )}
          <span className={cn(PILL_CLASS, 'text-text-muted')}>{STOCK_SOURCE_LABEL[record.source]}</span>
          <StockPairBin sku={record.sku} barcode={record.location_barcode} face={face} homeLocation={record.home_location} />
        </div>
      </div>
    </div>
  );

  const itemRow = (
    <RecordGroup title="Item" titleHidden>
      {itemBody}
    </RecordGroup>
  );

  const main = placeholder ? (
    placeholder.main(itemRow)
  ) : (
    <div className="flex min-w-0 flex-col gap-4">
      {stockRecordState(record) === 'onHold' ? (
        // A TMP- SKU the loader did not flag: it still cannot be sold by name.
        <EvidenceNotice tone="warn">A floor-minted placeholder — pair it to its Zoho item before it sells.</EvidenceNotice>
      ) : null}
      {itemRow}
      <StockLocationsGroup sku={record.sku} onChanged={onCounted} />
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      {placeholder?.aside}
      {/* A stock pair is not a task anchor kind: a standalone task titled where · what. */}
      <RecordGroup title="Send to staff" testId="stock-record-send">
        <RecordTaskForm
          kind="staff"
          target={{ entityType: null, entityId: null, label: `${face ?? 'No location'} · ${record.sku}` }}
          onDone={() => undefined}
        />
      </RecordGroup>
      <RecordGroup title="Movement" testId="stock-record-location">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Last moved">{stamp(record.last_moved) ?? '—'}</EvidenceFactRow>
          {record.source === 'bin' ? (
            <EvidenceFactRow label="Counted">{stamp(record.last_counted) ?? 'Never'}</EvidenceFactRow>
          ) : null}
        </div>
      </RecordGroup>
    </div>
  );

  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="stock-evidence">
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
