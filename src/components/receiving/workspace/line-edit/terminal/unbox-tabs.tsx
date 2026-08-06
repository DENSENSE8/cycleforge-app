'use client';

import type { ReactNode } from 'react';
import { UnitsDisplayHost } from '../UnitsDisplayHost';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { POUnboxingSection } from '../POUnboxingSection';
import { UnboxProcedureChecklist } from '../UnboxProcedureChecklist';
import { PhotosDisplayHost } from '../PhotosDisplayHost';
import { LinkageDisplayHost } from '../LinkageDisplayHost';
import { TicketDisplayHost } from '../TicketDisplayHost';
import { ReceivingAuditPanel } from '../../ReceivingAuditPanel';
import { SupportContextHub } from '@/components/support/context';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { buildSectionTabs, WorkspaceTimelineTab } from '@/components/station/workbench';
import {
  Barcode,
  ClipboardList,
  ExternalLink,
  History,
  Images,
  Link2,
  MapPin,
  MessageSquare,
  SlidersHorizontal,
  Ticket,
} from '@/components/Icons';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';
import type { PoNoteTabState } from './usePoNoteTabState';
import type {
  UnboxLinkageAction,
  UnboxPhotoAction,
  UnboxSideTab,
  UnboxTicketAction,
  UnboxUnitsAction,
} from '../unbox-side-tabs';
import { TrackingNumbersTab } from '../TrackingNumbersTab';
import { ListingLinksTab } from '../ListingLinksTab';
import { TriageClassifySection } from '@/components/receiving/triage/TriageClassifySection';
import type { ClaimModalMode } from '../../claim/claim-types';

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
  /** Which side tab is showing — gates the lazily-mounted Support hub / ticket. */
  activeSideTab: UnboxSideTab | null;
  hasUnits: boolean;
  serialCount: number;
  hasTimelineTab: boolean;
  hasTrackingTab: boolean;
  hasListingsTab: boolean;
  /** Always true — Classify is the SoT editor (strip for unfound, overflow for matched). */
  hasClassifyTab: boolean;
  /** Unfound: Classify stays on the strip. Matched: under ⋯. */
  classifyOnStrip: boolean;
  /** Linkage (Pairing + Zoho note) needs a carton record. */
  hasLinkageTab: boolean;
  poIdForTracking: string;
  hasPoNoteTab: boolean;
  poNote: PoNoteTabState;
  photoAction: UnboxPhotoAction;
  onPhotoActionChange: (action: UnboxPhotoAction) => void;
  linkageAction: UnboxLinkageAction;
  onLinkageActionChange: (action: UnboxLinkageAction) => void;
  unitsAction: UnboxUnitsAction;
  onUnitsActionChange: (action: UnboxUnitsAction) => void;
  /** Nested Prebox tab — gated on carton serials. */
  hasPrebox: boolean;
  claimMode: ClaimModalMode;
  onCloseClaim: () => void;
  onCloseTicket: () => void;
  onClaimTicketCreated: (ticketNumber: string) => void;
  onClaimTicketUnlinked: () => void;
  /** Header classify pill → open this dimension in TriageClassifySection. */
  classifyExpandDimension?: 'urgency' | 'platform' | 'type' | null;
  /** Bump to re-open the same dimension from the header. */
  classifyExpandRequestId?: number;
  /**
   * Carton `# ----` handoff — which pairing tab the Linkage Link display opens on.
   */
  pairingFocusTab?: 'zoho_po' | null;
  /** Bump to re-select the PO tab when linkage is already showing. */
  pairingFocusRequestId?: number;
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
  /** Filled multi-qty unit pencil → open Units display + edit handoff. */
  onEditFilledSerial?: (serial: {
    id: number;
    serial_number: string;
    condition_grade?: string | null;
  }) => void;
  /** Serials cell "View All" → Units Displays. */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
}

/**
 * The Unbox CENTRE — PO lines (condition + serial) → label preview.
 *
 * No tab strip above it: `overview` is the whole workbench body, and every other
 * display lives in the right-edge Displays push column ({@link buildUnboxSideTabs}).
 *
 * The guided ProcedureDeck / step dock continues on the `unbox-work` lane
 * (`../cycleforge-unbox`); main dogfood ships this PO-line centre instead.
 */
export function buildUnboxOverview(
  input: Pick<
    BuildUnboxTabsInput,
    | 'row'
    | 'staffId'
    | 'c'
    | 'onItemDescFeedback'
    | 'onItemDescSaved'
    | 'accordionBootstrap'
    | 'onEditFilledSerial'
    | 'onViewAllUnits'
  >,
): ReactNode {
  const {
    row,
    staffId,
    c,
    onItemDescFeedback,
    onItemDescSaved,
    accordionBootstrap = 'default',
    onEditFilledSerial,
    onViewAllUnits,
  } = input;

  return (
    <div className="space-y-0">
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
        onItemDescFeedback={onItemDescFeedback}
        onItemDescSaved={onItemDescSaved}
        accordionBootstrap={accordionBootstrap}
        onEditFilledSerial={onEditFilledSerial}
        onViewAllUnits={onViewAllUnits}
      />
      <UnboxLabelPreview row={row} c={c} />
    </div>
  );
}

/**
 * Build the Unbox side displays for the Displays push column.
 *
 * Strip (left → right): Ticket · Photos · Linkage · Classify · Units.
 * Ticket is presence-exclusive (Claim vs Chat — no nested tabs). Units nests
 * Units · Prebox. Overflow: Listings · Support · Tracking · Timeline (Audit
 * nested in Timeline). Checklist is ring-only.
 */
export function buildUnboxSideTabs(input: BuildUnboxTabsInput): SectionTab[] {
  const {
    row,
    staffId,
    c,
    activeSideTab,
    hasUnits,
    serialCount,
    hasTimelineTab,
    hasTrackingTab,
    hasListingsTab,
    hasClassifyTab,
    classifyOnStrip,
    hasLinkageTab,
    poIdForTracking,
    hasPoNoteTab,
    poNote,
    photoAction,
    onPhotoActionChange,
    linkageAction,
    onLinkageActionChange,
    unitsAction,
    onUnitsActionChange,
    hasPrebox,
    claimMode,
    onCloseClaim,
    onCloseTicket,
    onClaimTicketCreated,
    onClaimTicketUnlinked,
    classifyExpandDimension = null,
    classifyExpandRequestId = 0,
    pairingFocusTab = null,
    pairingFocusRequestId = 0,
  } = input;

  const ticketId = c.providerTicketId as number | null | undefined;

  return buildSectionTabs([
    {
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content:
        activeSideTab === 'ticket' ? (
          <TicketDisplayHost
            row={row}
            ticketId={ticketId}
            claimMode={claimMode}
            onCloseClaim={onCloseClaim}
            onCloseTicket={onCloseTicket}
            onClaimTicketCreated={onClaimTicketCreated}
            onClaimTicketUnlinked={onClaimTicketUnlinked}
            returnClaimPrefill={c.returnClaimPrefill ?? null}
          />
        ) : null,
    },
    {
      id: 'photos',
      label: 'Photos',
      icon: Images,
      content:
        activeSideTab === 'photos' ? (
          <PhotosDisplayHost
            row={row}
            action={photoAction}
            onActionChange={onPhotoActionChange}
          />
        ) : null,
    },
    {
      id: 'linkage',
      label: 'Linkage',
      icon: Link2,
      visible: hasLinkageTab,
      content:
        activeSideTab === 'linkage' ? (
          <LinkageDisplayHost
            row={row}
            staffId={staffId}
            action={linkageAction}
            onActionChange={onLinkageActionChange}
            hasPoNote={hasPoNoteTab}
            poNote={poNote}
            pairingFocusTab={pairingFocusTab}
            pairingFocusRequestId={pairingFocusRequestId}
            autoMatch={
              c.isUnfound
                ? {
                    receivingId: row.receiving_id ?? null,
                    lineId: row.id ?? null,
                    trackingNumber: row.tracking_number ?? null,
                    receivedSerial: row.serials?.[0]?.serial_number ?? null,
                    providerTicketId: c.providerTicketId,
                    ticketNumber: c.supportTicket?.label ?? null,
                    ticketUrl: c.supportTicket?.openUrl ?? null,
                    onTicketChanged: () => void c.invalidateSupportTicket(),
                  }
                : null
            }
          />
        ) : null,
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
      priority: 'overflow',
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
        <UnitsDisplayHost
          receivingId={row.receiving_id ?? null}
          activeLineId={row.id ?? null}
          staffId={staffId}
          action={unitsAction}
          onActionChange={onUnitsActionChange}
          hasPrebox={hasPrebox}
          c={{
            cond: c.cond,
            setCond: c.setCond,
            patch: c.patch,
            serialSubmitting: c.serialSubmitting,
            headerSerialEdit: c.headerSerialEdit,
            setHeaderSerialEdit: c.setHeaderSerialEdit,
            enqueueSerial: c.enqueueSerial,
            deleteSerialUnit: c.deleteSerialUnit,
            replaceSerialUnit: c.replaceSerialUnit,
            setUnitGrade: c.setUnitGrade,
            setUnitLabelCondition: c.setUnitLabelCondition,
            serialAbsent: c.serialAbsent,
            serialAbsentReason: c.serialAbsentReason,
            requireSerialConfirmation: c.requireSerialConfirmation,
            commitSerialAbsent: c.commitSerialAbsent,
            serialRef: c.serialRef,
            handleFileReturnClaim: c.handleFileReturnClaim,
            serialLookup: c.serialLookup,
          }}
        />
      ),
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      stripHidden: true,
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
          <UnboxProcedureChecklist row={row} />
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
        <div className="space-y-4">
          <WorkspaceTimelineTab
            poId={poIdForTracking || null}
            tracking={row.tracking_number ?? null}
            receivingId={row.receiving_id ?? null}
          />
          {row.receiving_id != null && activeSideTab === 'timeline' ? (
            <ReceivingAuditPanel
              open
              receivingId={row.receiving_id}
              onClose={() => undefined}
              hideHeader
            />
          ) : null}
        </div>
      ),
    },
  ]);
}

export function UnboxSectionTabs({
  tabs,
  value,
  onChange,
  rightSlot,
  headerClassName,
  compact = false,
  fillHeight = false,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  /** Right cluster: vertical ⋮ peer · flat pencil (pencil rightmost). */
  rightSlot?: ReactNode;
  /**
   * Optional strip-row class. Unbox no longer passes one — the flush host
   * (`DISPLAYS_FLUSH_HOST`, `px-0`) makes the topic plate edge-to-edge with no
   * `-mx-4` cancel. Kept for sibling surfaces that still need a header override.
   */
  headerClassName?: string;
  /**
   * Icon plate: tighter horizontal padding only — never a shorter face.
   */
  compact?: boolean;
  /**
   * Column fill — Unbox Displays push hosts pinned footers (Ticket → Claim).
   * See {@link SectionTabsSlider} `fillHeight`.
   */
  fillHeight?: boolean;
}) {
  return (
    <SectionTabsSlider
      tabs={tabs}
      value={value}
      onChange={onChange}
      ariaLabel="Unbox displays"
      rightSlot={rightSlot}
      headerClassName={headerClassName}
      compact={compact}
      fillHeight={fillHeight}
      // SpaceX h-10 topic plate: idle = icon-only (tooltip + a11y name),
      // selected expands to icon + caption label; trailing ⋮ is edge-flush.
      density="icon"
    />
  );
}
