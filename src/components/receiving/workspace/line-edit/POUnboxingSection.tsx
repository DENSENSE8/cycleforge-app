'use client';

/**
 * POUnboxingSection — the PO **line list** card with optional condition + serial.
 *
 * Unbox centre mounts this with `editLines` + `serialScan` so the operator can
 * grade and scan on the accordion. Triage ({@link TriagePoUnboxingSection}) and
 * Testing compose it too.
 *
 * Package Pairing left it on 2026-08-02 and is the `pairing` Displays tab on
 * the right edge ({@link buildUnboxSideTabs}).
 */

import { LinePoItemsSection } from './LinePoItemsSection';
import { WorkspaceCard } from '@/design-system/components';
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
}: POUnboxingSectionProps) {
  const linkedPo = !c.isUnfound && !shouldUseUnmatchedItemsSurface(row);
  const showPoItems = poItems || (includeLinkedPoItems && matching && linkedPo);

  if (!showPoItems) return null;

  return (
    <WorkspaceCard
      variant="glass"
      overflow="visible"
      bodyDensity="nested"
      bodyClassName="px-3 pt-3 pb-2"
    >
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
      />
    </WorkspaceCard>
  );
}
