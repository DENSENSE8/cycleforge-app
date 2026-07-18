'use client';

/**
 * Build the Triage SectionTabsSlider tab list (Classify / Staging / Pairing).
 */

import type { ReactNode } from 'react';
import { ClipboardList, MapPin, Link2 } from '@/components/Icons';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { LinePoItemsSection } from '../workspace/line-edit/LinePoItemsSection';
import { POUnboxingSection } from '../workspace/line-edit/POUnboxingSection';
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
  onItemDescFeedback,
  onItemDescSaved,
  onNotesFeedback,
}: {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  staging: TriageStagingController;
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
          <TriageClassifySection row={row} c={c} />
          {linkedPo ? (
            <WorkspaceCard variant="glass" overflow="visible">
              <LinePoItemsSection
                row={row}
                staffId={staffId}
                serialScan={false}
                openInUnbox
                editLines={false}
                c={c}
                embedded
                onItemDescFeedback={onItemDescFeedback}
                onItemDescSaved={onItemDescSaved}
              />
            </WorkspaceCard>
          ) : null}
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
        <POUnboxingSection
          row={row}
          staffId={staffId}
          poItems={false}
          matching
          includeLinkedPoItems={false}
          openInUnbox
          editLines={false}
          serialScan={false}
          c={c}
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
    />
  );
}
