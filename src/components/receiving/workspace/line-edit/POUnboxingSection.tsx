'use client';

/**
 * POUnboxingSection — the PO **line list** card, and nothing else.
 *
 * This is the `contents` step body of the Unbox procedure deck: *what is in
 * this box*. Package Pairing left it on 2026-08-02 and is now the `pairing`
 * Displays tab on the right edge ({@link buildUnboxSideTabs}) — its toggle
 * always lived on that edge, so the surface it opens belongs there too.
 * Auto-match (Quick match) travelled with it, still embedded inside
 * {@link CartonMatchHub} rather than as a sibling strip.
 *
 * Units-on-carton and Notes/Label are likewise not here — they are their own
 * displays / steps.
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
