'use client';

import { PoLinesAccordion } from '@/components/receiving/workspace/PoLinesAccordion';
import { UnmatchedItemsSection } from '@/components/receiving/workspace/UnmatchedItemsSection';
import { InlineNotice } from '@/design-system/components';
import { type UnitSlotSerial } from '@/components/tech/TestingUnitSlots';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { TestingLineSlot } from './TestingLineSlot';
import { dispatchTestingLineUpdated } from '@/components/tech/testing-line-events';
import {
  shouldUseUnmatchedItemsSurface,
} from '@/lib/receiving/intake-items-routing';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

interface Props {
  row: ReceivingLineRow;
  staffId: string;
  c: TestingController;
  embedded?: boolean;
  headerRight?: React.ReactNode;
  /** Hide the "PO items · N" header — parent tab row owns the pencil. */
  suppressHeader?: boolean;
  /**
   * Open the right-edge Units Display for a line (serials-cell / edit click).
   * The per-unit verdict list is an Action Display, not a centre `activeRowSlot`
   * — the centre PO line stays a pure ledger row (title · meta · serials
   * preview), matching Unbox. See TestingPanel `openUnits`.
   */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
}

/**
 * PO-items block for the testing workspace — the same accordion / unmatched
 * surface as Unbox, rendered as a **pure ledger row**. The per-unit verdict
 * surface ({@link TestingLineSlot}) no longer mounts under the row in the
 * centre; the serials cell opens the right-edge Units Display via
 * {@link onViewAllUnits} (Unbox parity). Composed inside
 * {@link TestingPoUnboxingSection} in embedded mode so the wrapper owns the card
 * chrome and the single package-pairing pencil (no CartonAddPopover modal).
 */
export function TestingPoItemsSection({
  row,
  staffId,
  c,
  embedded = false,
  headerRight,
  suppressHeader = false,
  onViewAllUnits,
}: Props) {
  if (row.receiving_id == null) {
    // Not linked to a carton yet — no longer a dead end. A REAL line (positive
    // id) can still take a serial (the scan-serial route attaches by
    // receiving_line_id), so render a standalone entry; a synthetic stub
    // (negative id) has no line to attach to, so teach the next step instead.
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

  if (shouldUseUnmatchedItemsSurface(row)) {
    // Freshly-scanned unfound carton with no line yet — the synthetic stub row
    // carries a negative id (buildUnmatchedStubRow). Teach the next action so the
    // empty carton isn't a dead end. UI-only; no extra fetch.
    const linelessUnfound = row.receiving_source === 'unmatched' && row.id < 0;
    return (
      <div className="space-y-2">
        {linelessUnfound ? (
          <InlineNotice tone="info" size="sm" title="No items yet">
            Add the product via Package Pairing → Purchase Order (Acknowledge by Inventory SKU),
            or scan a unit serial below.
          </InlineNotice>
        ) : null}
        <UnmatchedItemsSection
          receivingId={row.receiving_id}
          staffId={staffId}
          embedded={embedded}
          headerRight={headerRight}
          suppressHeader={suppressHeader}
          sourcePlatformHint={c.sourcePlatform || undefined}
          receivingTypeHint={isReturnIntake(row) ? 'RETURN' : c.receivingType}
          listingUrlHint={c.listingLink || undefined}
          activeLineId={row.id}
          placeholderActiveRow={row.id > 0 ? row : undefined}
          hideNoTestLines
          onViewAllUnits={onViewAllUnits}
        />
      </div>
    );
  }

  return (
    <PoLinesAccordion
      receivingId={row.receiving_id}
      activeLineId={row.id}
      embedded={embedded}
      headerRight={headerRight}
      suppressHeader={suppressHeader}
      placeholderActiveRow={row}
      hideNoTestLines
      serialSplit={{
        staffId,
        cartonSource: row.receiving_source,
        onAfterSplit: (line) => {
          dispatchTestingLineUpdated({ id: line.id, serials: line.serials ?? [] });
        },
      }}
      onViewAllUnits={onViewAllUnits}
    />
  );
}
