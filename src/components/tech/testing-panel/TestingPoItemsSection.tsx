'use client';

import { PoLinesAccordion } from '@/components/receiving/workspace/PoLinesAccordion';
import { UnmatchedItemsSection } from '@/components/receiving/workspace/UnmatchedItemsSection';
import { InlineNotice } from '@/design-system/components';
import { type UnitSlotSerial } from '@/components/tech/TestingUnitSlots';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { TestingLineSlot, confirmDeleteSerial } from './TestingLineSlot';
import { TestingSerialLinkControls } from './TestingSerialLinkControls';
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
}

/**
 * PO-items block for the testing workspace — same accordion / unmatched list as
 * unbox, but the active-row slot renders {@link TestingLineSlot} (verdict pills)
 * instead of condition + receive serials. Composed inside
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
          renderLineActions={(line) => (
            <TestingLineSlot
              c={c}
              lineId={line.id}
              serials={(line.serials ?? []) as UnitSlotSerial[]}
              expected={line.quantity_expected ?? null}
              disabled={c.saving}
              selectedIndex={c.activeSlotByLine[line.id] ?? 0}
              showSavedChips={false}
            />
          )}
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
      renderTitleActions={(line) => (
        <TestingSerialLinkControls carton={row} line={line} />
      )}
      activeSerialActions={{
        editingSerialId: c.headerSerialEdit?.id ?? null,
        onEdit: (s) => c.setHeaderSerialEdit(s as UnitSlotSerial),
        onDelete: async (s, lineId) => {
          if (s.id == null) return;
          if (!(await confirmDeleteSerial(s.serial_number))) return;
          if (c.headerSerialEdit?.id === s.id) c.setHeaderSerialEdit(null);
          void c.deleteSerial(lineId, s.id);
        },
      }}
      activeRowSlot={({ serials }) => (
        <TestingLineSlot
          c={c}
          lineId={row.id}
          serials={serials as UnitSlotSerial[]}
          expected={row.quantity_expected ?? null}
          disabled={row.receiving_id == null || c.saving}
          selectedIndex={c.activeSlot}
          autoFocus
          showSavedChips={false}
          editingSerial={c.headerSerialEdit}
          onEditingSerialChange={c.setHeaderSerialEdit}
        />
      )}
    />
  );
}
