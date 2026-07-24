'use client';

import type { ReactNode } from 'react';
import { CartonUnitsRollupBody } from '../../CartonUnitsRollup';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { POUnboxingSection } from '../POUnboxingSection';
import { LineChecklistTab } from '../LineChecklistTab';
import { LinePoNoteCard } from '../LinePoNoteCard';
import { SupportContextHub } from '@/components/support/context';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { buildSectionTabs, WorkspaceTimelineTab } from '@/components/station/workbench';
import { Barcode, ClipboardList, ExternalLink, FileText, History, MapPin, MessageSquare, PackageOpen, SlidersHorizontal, Ticket } from '@/components/Icons';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';
import type { PoNoteTabState } from './usePoNoteTabState';
import type { UnboxView } from './types';
import type {
  ChecklistTabBridge,
  ConversationTabBridge,
  UnitsTabBridge,
} from './unbox-tab-bridges';
import { TrackingNumbersTab } from '../TrackingNumbersTab';
import { ListingLinksTab } from '../ListingLinksTab';
import { TriageClassifySection } from '@/components/receiving/triage/TriageClassifySection';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';

/** Compact strip label from the Integrations provider catalog (SoT). */
function providerStripLabel(providerKey: string): string {
  const full = providerCatalogLabel(providerKey);
  // Tab strip wants the brand token ("Zoho Inventory" → "Zoho").
  const brand = full.split(/\s+/)[0]?.trim();
  return brand || full;
}

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
  hasTrackingTab: boolean;
  hasListingsTab: boolean;
  /** Always true — Classify is the SoT editor (strip for unfound, overflow for matched). */
  hasClassifyTab: boolean;
  /** Unfound: Classify on primary strip order 2. Matched: under ⋯. */
  classifyOnStrip: boolean;
  poIdForTracking: string;
  hasPoNoteTab: boolean;
  poNote: PoNoteTabState;
  pairingOpen: boolean;
  onPairingToggle: () => void;
  onItemDescFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved: (lineId: number, zohoNotes: string | null) => void;
  onChecklistBridge?: (bridge: ChecklistTabBridge | null) => void;
  onUnitsBridge?: (bridge: UnitsTabBridge | null) => void;
  onConversationBridge?: (bridge: ConversationTabBridge | null) => void;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
  /** Header classify pill → open this dimension in TriageClassifySection. */
  classifyExpandDimension?: 'urgency' | 'platform' | 'type' | null;
  /** Bump to re-open the same dimension from the header. */
  classifyExpandRequestId?: number;
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
    hasTrackingTab,
    hasListingsTab,
    hasClassifyTab,
    classifyOnStrip,
    poIdForTracking,
    hasPoNoteTab,
    poNote,
    pairingOpen,
    onPairingToggle,
    onItemDescFeedback,
    onItemDescSaved,
    onChecklistBridge,
    onUnitsBridge,
    onConversationBridge,
    accordionBootstrap = 'default',
    classifyExpandDimension = null,
    classifyExpandRequestId = 0,
  } = input;

  // Strip: Unbox · Classify (unfound) | Listings (matched) · Ticket · …
  // Header bookmark shows locked-width icon faces; Classify tab checklist is
  // the edit surface (clicking a face routes here via onClassifyPillOpen).
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
            accordionBootstrap={accordionBootstrap}
          />
          <UnboxLabelPreview row={row} c={c} />
        </div>
      ),
    },
    {
      id: 'classify',
      label: 'Classify',
      icon: SlidersHorizontal,
      visible: hasClassifyTab,
      priority: classifyOnStrip ? 'primary' : 'overflow',
      content: (
        <TriageClassifySection
          row={row}
          c={c}
          expandDimension={classifyExpandDimension}
          expandRequestId={classifyExpandRequestId}
        />
      ),
    },
    {
      id: 'listings',
      label: 'Listings',
      icon: ExternalLink,
      visible: hasListingsTab,
      content: (
        <ListingLinksTab
          listingLinks={c.listingLinks ?? []}
          listingLink={c.listingLink}
          setListingLink={c.setListingLink}
        />
      ),
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
              onRequestLinkTicket={() => c.openClaimModal('link')}
              className="h-full min-h-0 rounded-2xl"
            />
          </div>
        ) : null,
    },
    {
      id: 'units',
      label: 'Units',
      icon: Barcode,
      count: serialCount,
      visible: hasUnits,
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
          <div className="space-y-3">
            <CartonUnitsRollupBody
              receivingId={row.receiving_id ?? null}
              activeLineId={row.id ?? null}
              showEmpty
              onBridgeChange={onUnitsBridge}
            />
          </div>
        </WorkspaceCard>
      ),
    },
    {
      id: 'po-note',
      label: providerStripLabel('zoho'),
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
      priority: 'overflow',
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
          <LineChecklistTab
            lineId={row.id}
            sku={row.sku}
            onBridgeChange={onChecklistBridge}
          />
        </WorkspaceCard>
      ),
    },
    {
      id: 'support',
      label: 'Support',
      icon: MessageSquare,
      priority: 'overflow',
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
      id: 'tracking',
      label: 'Tracking',
      icon: MapPin,
      priority: 'overflow',
      visible: hasTrackingTab,
      content: (
        <TrackingNumbersTab
          trackingEdit={c.trackingEdit}
          setTrackingEdit={c.setTrackingEdit}
          onCommitTracking={(v) => {
            const trimmed = v.trim();
            if (trimmed !== (row.tracking_number || '').trim()) {
              c.patch({ zoho_reference_number: trimmed || null });
            }
          }}
          extraTrackings={c.extraTrackings}
          setExtraTrackings={c.setExtraTrackings}
          onCommitExtraTracking={(v, i) => void c.attachExtraBox(v, i)}
          primaryTrackingTrimmed={c.primaryTrackingTrimmed}
        />
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      priority: 'overflow',
      visible: hasTimelineTab,
      content: (
        <WorkspaceTimelineTab
          poId={poIdForTracking || null}
          tracking={row.tracking_number ?? null}
          receivingId={row.receiving_id ?? null}
        />
      ),
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
