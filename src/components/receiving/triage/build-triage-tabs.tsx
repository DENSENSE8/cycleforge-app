'use client';

/**
 * Build the Triage SectionTabsSlider tab list (Classify / Staging / Pairing).
 * Tab bar owns labels + Edit-PO rightSlot — tab bodies stay unlabeled.
 */

import type { ReactNode } from 'react';
import { ClipboardList, MapPin, Link2 } from '@/components/Icons';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { TriagePoUnboxingSection } from './TriagePoUnboxingSection';
import { WorkspaceNotesCard } from '../workspace/line-edit/WorkspaceNotesCard';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import type { UnboxLineController } from '../workspace/line-edit/unbox-line-controller';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { TriageClassifySection } from './TriageClassifySection';
import { StagingSection } from './StagingSection';
import { UnfoundTodoStrip } from './UnfoundTodoStrip';
import type { TriageStagingController } from './useTriageStaging';
import type { TriageFocusTab } from '@/lib/receiving/triage-focus';

/** Alias — SectionTabsSlider ids stay locked to {@link TriageFocusTab}. */
export type TriageView = TriageFocusTab;

export function buildTriageTabs({
  row,
  staffId,
  c,
  staging,
  pairingOpen,
  onPairingToggle,
  onItemDescFeedback,
  onItemDescSaved,
  onNotesFeedback,
}: {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  staging: TriageStagingController;
  pairingOpen: boolean;
  onPairingToggle: () => void;
  onItemDescFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved: (lineId: number, zohoNotes: string | null) => void;
  onNotesFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
}): SectionTab[] {
  const linkedPo = !c.isUnfound && !shouldUseUnmatchedItemsSurface(row);
  const isReturn = isReturnIntake(row);
  const unfoundMessage = isReturn
    ? "No claim hint on the label — that's fine (C6). Save for unbox any time; it stays on Unfound until paired."
    : 'Still unfound — pairing will retry. Save for unbox is allowed while it works.';

  return buildSectionTabs([
    {
      id: 'overview',
      label: 'Classify',
      icon: ClipboardList,
      content: (
        <div className="space-y-4">
          {/* Arrival Door→Classified→Staged→Ready lives only in the Arrival
              receiving-details Progress tab (Info → details), not here. */}
          <TriageClassifySection row={row} c={c} />
          <TriagePoUnboxingSection
            row={row}
            staffId={staffId}
            poItems={linkedPo}
            matching
            includeLinkedPoItems={false}
            openInUnbox
            editLines={false}
            serialScan={false}
            c={c}
            suppressItemsHeader
            pairingOpen={pairingOpen}
            onPairingToggle={onPairingToggle}
            onItemDescFeedback={onItemDescFeedback}
            onItemDescSaved={onItemDescSaved}
          />
          <WorkspaceNotesCard row={row} c={c} onActionFeedback={onNotesFeedback} />
          {row.receiving_source === 'unmatched' ? (
            <UnfoundTodoStrip message={unfoundMessage} />
          ) : null}
        </div>
      ),
    },
    {
      id: 'staging',
      label: 'Staging',
      icon: MapPin,
      content: <StagingSection staging={staging} />,
    },
    {
      id: 'pairing',
      label: 'Pairing',
      icon: Link2,
      content: (
        <TriagePoUnboxingSection
          row={row}
          staffId={staffId}
          poItems={false}
          matching
          includeLinkedPoItems={false}
          openInUnbox
          editLines={false}
          serialScan={false}
          c={c}
          suppressItemsHeader
          pairingOpen
          onItemDescFeedback={onItemDescFeedback}
          onItemDescSaved={onItemDescSaved}
        />
      ),
    },
  ]);
}

export function TriageSectionTabs({
  tabs,
  value,
  onChange,
  rightSlot,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  rightSlot?: ReactNode;
}) {
  return (
    <SectionTabsSlider
      tabs={tabs}
      value={value}
      onChange={onChange}
      ariaLabel="Triage displays"
      rightSlot={rightSlot}
    />
  );
}
