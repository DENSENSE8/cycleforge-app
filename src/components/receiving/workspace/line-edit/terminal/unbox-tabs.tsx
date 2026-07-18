'use client';

import type { ReactNode } from 'react';
import { CartonUnitsRollupBody } from '../../CartonUnitsRollup';
import { WorkspaceNotesCard } from '../WorkspaceNotesCard';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { POUnboxingSection } from '../POUnboxingSection';
import { LineChecklistTab } from '../LineChecklistTab';
import { LinePoNoteCard } from '../LinePoNoteCard';
import { SupportContextHub } from '@/components/support/context';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { buildSectionTabs, WorkspaceTimelineTab } from '@/components/station/workbench';
import {
  Barcode,
  ClipboardList,
  FileText,
  History,
  MessageSquare,
  PackageOpen,
  Ticket,
} from '@/components/Icons';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';
import type { PoNoteTabState } from './usePoNoteTabState';
import type { UnboxView } from './types';
import type {
  ChecklistTabBridge,
  ConversationTabBridge,
  UnitsTabBridge,
} from './unbox-tab-bridges';

/**
 * Controller is the full `useUnboxLineController` return. Typed as unknown at
 * the boundary so this module doesn't import the heavy controller type; the
 * call site in LineEditPanel passes `c` directly.
 */
export interface BuildUnboxTabsInput {
  row: ReceivingLineRow;
  staffId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unbox controller return
  c: any;
  activeUnboxView: UnboxView;
  hasUnits: boolean;
  serialCount: number;
  hasTimelineTab: boolean;
  poIdForTracking: string;
  hasPoNoteTab: boolean;
  poNote: PoNoteTabState;
  pairingOpen: boolean;
  onPairingToggle: () => void;
  onItemDescFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved: (lineId: number, zohoNotes: string | null) => void;
  activeStep: string | null | undefined;
  onActionFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  onChecklistBridge?: (bridge: ChecklistTabBridge | null) => void;
  onUnitsBridge?: (bridge: UnitsTabBridge | null) => void;
  onConversationBridge?: (bridge: ConversationTabBridge | null) => void;
}

/**
 * Build the Unbox SectionTabsSlider tab list. Visibility gates stay here so the
 * terminal registry tab ids stay in lock-step with what the slider actually shows.
 * Filters through {@link buildSectionTabs} — the shared waist for all stations.
 */
export function buildUnboxTabs(input: BuildUnboxTabsInput): SectionTab[] {
  const {
    row,
    staffId,
    c,
    activeUnboxView,
    hasUnits,
    serialCount,
    hasTimelineTab,
    poIdForTracking,
    hasPoNoteTab,
    poNote,
    pairingOpen,
    onPairingToggle,
    onItemDescFeedback,
    onItemDescSaved,
    activeStep,
    onActionFeedback,
    onChecklistBridge,
    onUnitsBridge,
    onConversationBridge,
  } = input;

  return buildSectionTabs([
    {
      id: 'overview',
      label: 'Unbox',
      icon: PackageOpen,
      content: (
        <div className="space-y-4">
          <POUnboxingSection
            row={row}
            staffId={staffId}
            poItems
            matching
            openInUnbox={false}
            editLines
            serialScan
            c={c}
            suppressItemsHeader
            pairingOpen={pairingOpen}
            onPairingToggle={onPairingToggle}
            onItemDescFeedback={onItemDescFeedback}
            onItemDescSaved={onItemDescSaved}
          />
          <WorkspaceNotesCard
            row={row}
            c={c}
            onActionFeedback={onActionFeedback}
            activeStep={activeStep as never}
          />
          <UnboxLabelPreview row={row} c={c} />
        </div>
      ),
    },
    {
      id: 'po-note',
      label: 'Inventory notes',
      icon: FileText,
      visible: hasPoNoteTab,
      content: (
        <LinePoNoteCard
          draft={poNote.draft}
          onDraftChange={poNote.setDraft}
          loading={poNote.loading}
        />
      ),
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-4">
          <LineChecklistTab
            lineId={row.id}
            sku={row.sku}
            onBridgeChange={onChecklistBridge}
          />
        </WorkspaceCard>
      ),
    },
    {
      id: 'units',
      label: `Units on carton · ${serialCount}`,
      icon: Barcode,
      count: serialCount,
      visible: hasUnits,
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyClassName="space-y-3 p-4">
          <CartonUnitsRollupBody
            receivingId={row.receiving_id ?? null}
            activeLineId={row.id ?? null}
            showEmpty
            onBridgeChange={onUnitsBridge}
          />
        </WorkspaceCard>
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      visible: hasTimelineTab,
      content: (
        <WorkspaceTimelineTab
          poId={poIdForTracking || null}
          tracking={row.tracking_number ?? null}
          receivingId={row.receiving_id ?? null}
        />
      ),
    },
    {
      id: 'support',
      label: 'Support',
      icon: MessageSquare,
      content:
        activeUnboxView === 'support' && (row.id != null || row.receiving_id != null) ? (
          <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden">
            <SupportContextHub
              anchor={{
                receivingId: row.receiving_id ?? null,
                lineId: row.id ?? null,
                tracking: row.tracking_number ?? null,
              }}
              variant="station"
              defaultSegment="team"
              hideCustomerSegment
              hideLinkage
              externalSubmit
              onBridgeChange={onConversationBridge}
              className="h-full min-h-0 rounded-2xl"
            />
          </div>
        ) : null,
    },
    {
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content:
        activeUnboxView === 'ticket' && (row.id != null || row.receiving_id != null) ? (
          <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden">
            <SupportContextHub
              anchor={{
                receivingId: row.receiving_id ?? null,
                lineId: row.id ?? null,
                tracking: row.tracking_number ?? null,
              }}
              variant="station"
              onlySegment="customer"
              hideLinkage
              className="h-full min-h-0 rounded-2xl"
            />
          </div>
        ) : null,
    },
  ]);
}

export function UnboxSectionTabs({
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
      ariaLabel="Unbox displays"
      rightSlot={rightSlot}
    />
  );
}
