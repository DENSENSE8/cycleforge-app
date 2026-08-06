'use client';

/**
 * POUnboxingSection — the PO **line list** (flat data floor) with optional
 * condition + serial. No glass card shell — elevation belongs on the action dock.
 *
 * Unbox centre mounts this with `editLines` + `serialScan` so the operator can
 * grade and scan on the accordion. Arrival (`TriagePanel`, read-only) and
 * Testing compose it too.
 *
 * Package Pairing left it on 2026-08-02 and is the `pairing` Displays tab on
 * the right edge ({@link buildUnboxSideTabs}).
 */

import { LinePoItemsSection } from './LinePoItemsSection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { InlineActionFeedbackPayload } from '../InlineActionFeedbackCard';
import type { UnboxLineController } from './unbox-line-controller';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';

interface POUnboxingSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  poItems: boolean;
  matching: boolean;
  openInUnbox: boolean;
  editLines: boolean;
  serialScan: boolean;
  c: UnboxLineController;
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  includeLinkedPoItems?: boolean;
  /**
   * Hide the "PO items · N" header — the parent (the unbox step card) owns it.
   * Triage omits this and keeps the header.
   */
  suppressItemsHeader?: boolean;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
  /** Filled multi-qty unit pencil → open Units display. */
  onEditFilledSerial?: (serial: {
    id: number;
    serial_number: string;
    condition_grade?: string | null;
  }) => void;
  /** Serials cell "View All" → Units Displays. */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
}

export function POUnboxingSection({
  row,
  staffId,
  poItems,
  matching,
  openInUnbox,
  editLines,
  serialScan,
  c,
  onItemDescFeedback,
  onItemDescSaved,
  includeLinkedPoItems = true,
  suppressItemsHeader = false,
  accordionBootstrap = 'default',
  onEditFilledSerial,
  onViewAllUnits,
}: POUnboxingSectionProps) {
  const linkedPo = !c.isUnfound && !shouldUseUnmatchedItemsSurface(row);
  const showPoItems = poItems || (includeLinkedPoItems && matching && linkedPo);

  if (!showPoItems) return null;

  // Flush data floor — zero radius / elevation. Depth lives on the elevated
  // action dock (notes + Print·Receive), not around PO line cards.
  return (
    <div className="min-w-0">
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
        accordionBootstrap={accordionBootstrap}
        onEditFilledSerial={onEditFilledSerial}
        onViewAllUnits={onViewAllUnits}
      />
    </div>
  );
}
