'use client';

import type { ReactNode } from 'react';
import { CartonUnitsRollupBody } from '../../CartonUnitsRollup';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { POUnboxingSection } from '../POUnboxingSection';
import { UnboxCaptureStack } from '../../UnboxCaptureStack';
import { LineChecklistTab } from '../LineChecklistTab';
import { LinePoNoteCard } from '../LinePoNoteCard';
import { SupportContextHub } from '@/components/support/context';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { buildSectionTabs, WorkspaceTimelineTab } from '@/components/station/workbench';
import { Barcode, ClipboardList, ExternalLink, FileText, History, MapPin, MessageSquare, SlidersHorizontal } from '@/components/Icons';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';
import type { PoNoteTabState } from './usePoNoteTabState';
import type { UnboxSideTab } from '../unbox-side-tabs';
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
  /** Which side tab is showing — gates the lazily-mounted Support hub. */
  activeSideTab: UnboxSideTab | null;
  hasUnits: boolean;
  serialCount: number;
  hasTimelineTab: boolean;
  hasTrackingTab: boolean;
  hasListingsTab: boolean;
  /** Always true — Classify is the SoT editor (strip for unfound, overflow for matched). */
  hasClassifyTab: boolean;
  /** Unfound: Classify on primary strip order 1. Matched: under ⋯. */
  classifyOnStrip: boolean;
  poIdForTracking: string;
  hasPoNoteTab: boolean;
  poNote: PoNoteTabState;
  pairingOpen: boolean;
  onPairingToggle: () => void;
  onItemDescFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved: (lineId: number, zohoNotes: string | null) => void;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
  /** Header classify pill → open this dimension in TriageClassifySection. */
  classifyExpandDimension?: 'urgency' | 'platform' | 'type' | null;
  /** Bump to re-open the same dimension from the header. */
  classifyExpandRequestId?: number;
}

/**
 * The Unbox CENTRE — capture stack → PO lines → label preview.
 *
 * No tab strip above it: `overview` is the whole workbench body, and every other
 * display moved to the right-edge Displays push column ({@link buildUnboxSideTabs}).
 */
export function buildUnboxOverview(
  input: Pick<
    BuildUnboxTabsInput,
    | 'row'
    | 'staffId'
    | 'c'
    | 'pairingOpen'
    | 'onPairingToggle'
    | 'onItemDescFeedback'
    | 'onItemDescSaved'
    | 'accordionBootstrap'
  >,
): ReactNode {
  const {
    row,
    staffId,
    c,
    pairingOpen,
    onPairingToggle,
    onItemDescFeedback,
    onItemDescSaved,
    accordionBootstrap = 'default',
  } = input;

  return (
    <div className="space-y-4">
      {/* Capture stack — READ-ONLY (capture-stack PLAN Phase 2). Bounded
          height so the bottom-anchor, the collapse density and the push-up
          motion behave exactly as they will once the input moves in
          (Phase 3); the accordion below still owns every write. */}
      <div className="flex max-h-[38vh] min-h-0 flex-col overflow-hidden">
        <UnboxCaptureStack row={row} />
      </div>
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
  );
}

/**
 * Build the eight Unbox side displays for the Displays push column.
 *
 * Visibility gates stay here so the strip and {@link resolveUnboxSideTab} agree
 * on what exists. Filters through {@link buildSectionTabs} — the shared waist for
 * all stations.
 *
 * Each tab owns its own actions now: the bottom dock is carton-terminal
 * (Print · Receive) and no longer changes with the selected display, so a
 * tab-scoped action (Save the PO note, Check all, Prebox, post a reply) is a
 * LOCAL control inside its own body. Ticket is not a display — it opens as
 * `ReceivingTicketStack`, a peer push column.
 */
export function buildUnboxSideTabs(input: BuildUnboxTabsInput): SectionTab[] {
  const {
    row,
    c,
    activeSideTab,
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
    classifyExpandDimension = null,
    classifyExpandRequestId = 0,
  } = input;

  return buildSectionTabs([
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
              showPreboxAction
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
          dirty={poNote.dirty}
          saving={poNote.saving}
          onSave={() => void poNote.save()}
          onSyncFromInventory={() => void poNote.syncFromInventory()}
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
          <LineChecklistTab lineId={row.id} sku={row.sku} />
        </WorkspaceCard>
      ),
    },
    {
      id: 'support',
      label: 'Support',
      icon: MessageSquare,
      priority: 'overflow',
      content:
        activeSideTab === 'support' && (row.id != null || row.receiving_id != null) ? (
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
              // No `externalSubmit`: the composer owns its own Send / Add note
              // now that the bottom dock is carton-terminal. That was the whole
              // job of the deleted support bridge.
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
