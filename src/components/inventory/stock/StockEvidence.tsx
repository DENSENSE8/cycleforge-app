'use client';

/**
 * Inventory › Stock — the open stock pair, on the triage card's soft, rounded
 * face. The header reads the stock then the product title (`StockLedger`).
 * Main = the item card — the photo (Upload · Phone inside it while empty),
 * the SKU chip, then the pinned location line: room · the exact tote/bin
 * (copies its dashed face) · how it is held · the SKU's home tote (Pair tote /
 * Switch home tote, `StockPairBin`) — then **Locations**: every tote and bin
 * the SKU sits in, each countable, plus Add location (`StockLocationsGroup`).
 * A placeholder (`TMP-`) swaps main for its own work column (this item card
 * first) and leads the aside with its own facts
 * (`placeholder`). Aside = [placeholder facts →] Send to staff → Movement.
 */

import { useSyncExternalStore, type ReactNode } from 'react';
import { format } from 'date-fns';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import {
  locationStockRowId,
  type LocationStockRoomFacet,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import type { StockScopeCounts } from '@/lib/neon/location-stock-queries';
import { stockRecordState } from './stock-record';
import { StockItemCard } from './StockItemCard';
import { StockLocationsGroup } from '@/components/stock/StockLocationsGroup';
import { StockPhotosGroup } from './StockPhotosGroup';

/** Fact rows inside a group — the carton record's facts body. */
const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** A `TMP-` placeholder's own record parts: its work column (handed this record's item card) and its facts. */
interface PlaceholderParts {
  main: (itemRow: ReactNode) => ReactNode;
  aside?: ReactNode;
  /** The item card's SKU line — a temporary SKU's chip with its Pair pencil. */
  skuContent?: ReactNode;
}

function stamp(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : format(at, 'MMM d, yyyy · h:mm a');
}

const subscribeNever = () => () => undefined;

/**
 * A stamp in the VIEWER's timezone. The server renders in UTC, so the formatted
 * text only paints after hydration (the server pass and the hydration pass both
 * paint the placeholder) — no hydration text mismatch (React #418).
 */
function LocalStamp({ iso, fallback }: { iso: string | null; fallback: string }) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const text = stamp(iso);
  if (!text) return <>{fallback}</>;
  return <time dateTime={iso ?? undefined}>{hydrated ? text : '…'}</time>;
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
  // Empty and populated records share this exact item layout. Only the empty
  // record swaps the title/SKU content for editors.
  const itemBody = <StockItemCard record={record} skuContent={placeholder?.skuContent} onChanged={onCounted} />;

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
        <EvidenceNotice tone="warn">A floor-minted placeholder — pair it to its permanent SKU before it sells.</EvidenceNotice>
      ) : null}
      {itemRow}
      <StockLocationsGroup sku={record.sku} onChanged={onCounted} />
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      {placeholder ? placeholder.aside : record.sku ? <StockPhotosGroup sku={record.sku} stockId={record.stock_id} /> : null}
      <RecordGroup title="Movement" testId="stock-record-location">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Last moved"><LocalStamp iso={record.last_moved} fallback="—" /></EvidenceFactRow>
          {record.source === 'bin' ? (
            <EvidenceFactRow label="Counted"><LocalStamp iso={record.last_counted} fallback="Never" /></EvidenceFactRow>
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
  pairs: number,
  counts: StockScopeCounts,
  rooms: readonly LocationStockRoomFacet[],
): RecordLedgerSummary {
  return {
    title: 'Stock',
    facts: [
      { label: 'Location × SKU pairs', value: pairs },
      { label: 'Products in stock', value: counts.inStockProducts },
      { label: 'Low stock', value: counts.lowStockPairs, warn: counts.lowStockPairs > 0 },
      { label: 'On hold (TMP)', value: counts.onHoldPairs, warn: counts.onHoldPairs > 0 },
      { label: 'At or below zero', value: counts.outPairs, warn: counts.outPairs > 0 },
      { label: 'Rooms', value: rooms.length },
    ],
  };
}
