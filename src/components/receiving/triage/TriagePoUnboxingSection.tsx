'use client';

/**
 * Arrival / triage PO + Package Pairing card.
 *
 * Sibling of Unbox {@link POUnboxingSection}:
 *   - No Auto-match strip (package not unboxed yet)
 *   - Arrival pairing hub without Inventory Item
 *   - Controlled collapse honors `pairingOpen` whenever matching is shown
 *     (does not gate on PO items — that broke hide/show for unfound)
 */

import { WorkspaceCard } from '@/design-system/components';
import { LinePoItemsSection } from '../workspace/line-edit/LinePoItemsSection';
import { TriageLineMatchingSection } from './TriageLineMatchingSection';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import type { UnboxLineController } from '../workspace/line-edit/unbox-line-controller';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';

export function TriagePoUnboxingSection({
  row,
  staffId,
  poItems,
  matching,
  openInUnbox = true,
  editLines = false,
  serialScan = false,
  c,
  onItemDescFeedback,
  onItemDescSaved,
  includeLinkedPoItems = false,
  suppressItemsHeader = false,
  pairingOpen: pairingOpenProp,
}: {
  row: ReceivingLineRow;
  staffId: string;
  poItems: boolean;
  matching: boolean;
  openInUnbox?: boolean;
  editLines?: boolean;
  serialScan?: boolean;
  c: UnboxLineController;
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  includeLinkedPoItems?: boolean;
  suppressItemsHeader?: boolean;
  pairingOpen?: boolean;
  /** Owned by TriagePanel PairingTogglePill — kept for call-site API parity. */
  onPairingToggle?: () => void;
}) {
  const linkedPo = !c.isUnfound && !shouldUseUnmatchedItemsSurface(row);
  const showPoItems = poItems || (includeLinkedPoItems && matching && linkedPo);
  const showPairing = matching;

  // Default closed when uncontrolled; Overview lifts state via pairingOpen.
  const pairingIsOpen = pairingOpenProp ?? false;

  // Unfound: no Edit-PO toggle — pairing stays visible.
  // Matched: honor pairingOpen (do not gate on showPoItems — that broke hide/show).
  const pairingCollapsed = showPairing && !c.isUnfound ? !pairingIsOpen : false;

  if (!showPoItems && !showPairing) return null;

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
      <div className="space-y-3">
        {showPoItems ? (
          <LinePoItemsSection
            row={row}
            staffId={staffId}
            serialScan={serialScan}
            openInUnbox={openInUnbox}
            editLines={editLines}
            c={c}
            embedded
            suppressHeader={suppressItemsHeader}
            onItemDescFeedback={onItemDescFeedback}
            onItemDescSaved={onItemDescSaved}
          />
        ) : null}

        {showPairing ? (
          <TriageLineMatchingSection
            row={row}
            staffId={staffId}
            showOpenInUnbox={openInUnbox}
            embedded
            collapsed={pairingCollapsed}
            showTopRule={showPoItems}
          />
        ) : null}
      </div>
    </WorkspaceCard>
  );
}
