'use client';

import { PoItemsSection } from '@/components/receiving/workspace/PoItemsSection';
import { InlineNotice } from '@/design-system/components';
import { type UnitSlotSerial } from '@/components/tech/TestingUnitSlots';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { TestingLineSlot } from './TestingLineSlot';
import { dispatchTestingLineUpdated } from '@/components/tech/testing-line-events';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import type { LineCollapseController } from '@/components/station/collapse';

interface Props {
  row: ReceivingLineRow;
  staffId: string;
  c: TestingController;
  embedded?: boolean;
  headerRight?: React.ReactNode;
  /** Hide the "PO items · N" header — parent tab row owns the pencil. */
  suppressHeader?: boolean;
  /** Open the right-edge Units Display for a line (serials-cell / edit click). */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /** The Items band's line-collapse controller ({@link useLineCollapse}), shared so "Collapse all" reaches the lines and not just the band —… */
  lineCollapse?: LineCollapseController;
}

/** PO-items block for the testing workspace — {@link PoItemsSection}, the same one Unbox and `/search` render, with Testing's controller in… */
export function TestingPoItemsSection({
  row,
  staffId,
  c,
  embedded = false,
  headerRight,
  suppressHeader = false,
  onViewAllUnits,
  lineCollapse,
}: Props) {
  if (row.receiving_id == null) {
    // Not linked to a carton yet — no longer a dead end.
    if (row.id > 0) {
      return (
        <div className="space-y-2">
          <InlineNotice tone="info" size="sm" title="Not linked to a carton">
            You can still scan the returned unit&apos;s serial here — link a PO from
            the header when ready.
          </InlineNotice>
          <TestingLineSlot
            c={c}
            lineId={row.id}
            serials={(row.serials ?? []) as UnitSlotSerial[]}
            expected={row.quantity_expected ?? null}
            disabled={c.saving}
            selectedIndex={c.activeSlot}
            autoFocus
            showSavedChips={false}
          />
        </div>
      );
    }
    return (
      <InlineNotice tone="info" size="sm" title="No carton linked">
        Link a PO from the header to add serials to this line.
      </InlineNotice>
    );
  }

  // Freshly-scanned unfound carton with no line yet — the synthetic stub row
  // carries a negative id (buildUnmatchedStubRow). Teach the next action so the
  // empty carton isn't a dead end. UI-only; no extra fetch.
  const linelessUnfound = row.receiving_source === 'unmatched' && row.id < 0;

  return (
    <PoItemsSection
      row={row}
      receivingId={row.receiving_id}
      staffId={staffId}
      embedded={embedded}
      headerRight={headerRight}
      suppressHeader={suppressHeader}
      hideNoTestLines
      lineCollapse={lineCollapse}
      onViewAllUnits={onViewAllUnits}
      sourcePlatformHint={c.sourcePlatform || undefined}
      receivingTypeHint={isReturnIntake(row) ? 'RETURN' : c.receivingType}
      listingUrlHint={c.listingLink || undefined}
      serialSplit={{
        staffId,
        cartonSource: row.receiving_source,
        onAfterSplit: (line) => {
          dispatchTestingLineUpdated({ id: line.id, serials: line.serials ?? [] });
        },
      }}
      laneNotice={
        linelessUnfound ? (
          <InlineNotice tone="info" size="sm" title="No items yet">
            Add the product via Package Pairing → Purchase Order (Acknowledge by Inventory SKU),
            or scan a unit serial below.
          </InlineNotice>
        ) : null
      }
    />
  );
}
