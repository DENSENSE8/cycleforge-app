'use client';

import type { ReactNode } from 'react';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { CartonUnitsRollupBody } from '../../CartonUnitsRollup';
import { WorkspaceNotesCard } from '../WorkspaceNotesCard';
import { LineLabelPreviewCard } from '../LineLabelPreviewCard';
import { POUnboxingSection } from '../POUnboxingSection';
import { LineChecklistTab } from '../LineChecklistTab';
import { LinePoNoteCard } from '../LinePoNoteCard';
import { UnboxTrackingTab } from '../UnboxTrackingTab';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import {
  Barcode,
  ClipboardList,
  FileText,
  MapPin,
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
  hasTrackingTab: boolean;
  poIdForTracking: string;
  hasTicketTab: boolean;
  linkedTicketId: number | null | undefined;
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
 */
export function buildUnboxTabs(input: BuildUnboxTabsInput): SectionTab[] {
  const {
    row,
    staffId,
    c,
    activeUnboxView,
    hasUnits,
    serialCount,
    hasTrackingTab,
    poIdForTracking,
    hasTicketTab,
    linkedTicketId,
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

  const tabs: SectionTab[] = [
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
            activeStep={activeStep as never}
          />
          <WorkspaceNotesCard
            row={row}
            c={c}
            onActionFeedback={onActionFeedback}
            activeStep={activeStep as never}
          />
          <LineLabelPreviewCard
            scanValue={c.scanValue}
            labelPayload={c.labelPayload}
            sku={row.sku}
            itemName={row.item_name}
            serialNumber={c.serialInput.trim()}
            labelDraftDefaults={c.labelDraftDefaults}
            buildLabelPayload={c.buildLabelPayload}
            onApplyAndPrint={c.applyAndPrintLabel}
          />
        </div>
      ),
    },
  ];

  if (hasPoNoteTab) {
    tabs.push({
      id: 'po-note',
      label: 'Inventory notes',
      icon: FileText,
      content: (
        <LinePoNoteCard
          draft={poNote.draft}
          onDraftChange={poNote.setDraft}
          loading={poNote.loading}
        />
      ),
    });
  }

  tabs.push({
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
  });

  if (hasUnits) {
    tabs.push({
      id: 'units',
      label: `Units on carton · ${serialCount}`,
      icon: Barcode,
      count: serialCount,
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
    });
  }

  if (hasTrackingTab) {
    tabs.push({
      id: 'tracking',
      label: 'Tracking',
      icon: MapPin,
      content: <UnboxTrackingTab poId={poIdForTracking} />,
    });
  }

  tabs.push({
    id: 'conversation',
    label: 'Conversation',
    icon: MessageSquare,
    content:
      activeUnboxView === 'conversation' && row.id != null ? (
        <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm">
          <ThreadPanel
            entityType="RECEIVING_LINE"
            entityId={row.id}
            externalSubmit
            onBridgeChange={onConversationBridge}
          />
        </div>
      ) : null,
  });

  if (hasTicketTab) {
    tabs.push({
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content:
        activeUnboxView === 'ticket' && linkedTicketId != null ? (
          <div className="flex h-[68vh] min-h-[460px] w-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm">
            <SupportTicketDetail
              ticketId={linkedTicketId}
              hideExternalLink
              embedded
              receivingId={row.receiving_id ?? undefined}
            />
          </div>
        ) : null,
    });
  }

  return tabs;
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
