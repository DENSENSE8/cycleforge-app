'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { UnitsDisplayHost } from '../UnitsDisplayHost';
import { PreboxDisplayHost } from '../PreboxDisplayHost';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { UnboxPlacementSection } from '../UnboxPlacementSection';
import { POUnboxingSection } from '../POUnboxingSection';
import { UnboxProcedureChecklist } from '../UnboxProcedureChecklist';
import { LinkageDisplayHost } from '../LinkageDisplayHost';
import { InventoryDisplayHost } from '../InventoryDisplayHost';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import {
  Barcode,
  ClipboardList,
  ExternalLink,
  History,
  Images,
  Link2,
  MapPin,
  MessageSquare,
  Boxes,
  Package,
  SlidersHorizontal,
  Ticket,
} from '@/components/Icons';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { PoNoteTabState } from './usePoNoteTabState';
import type {
  UnboxLinkageAction,
  UnboxPhotoAction,
  UnboxSideTab,
} from '../unbox-side-tabs';
import { TrackingNumbersTab } from '../TrackingNumbersTab';
import { ListingLinksTab } from '../ListingLinksTab';
import { TriageClassifySection } from '@/components/receiving/triage/TriageClassifySection';
import type { ClaimModalMode } from '../../claim/claim-types';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { DisplaysLeafBodySkeleton } from '@/components/station/displays/DisplaysLeafBodySkeleton';

/**
 * P3 Displays bodies — deferred chunks. Topic strip labels stay in this module;
 * Ticket / Photos / Timeline / Support chat must not ride the P1 paint path.
 * (ssr OK — they only mount when the topic is selected.)
 *
 * **Triage speed:** cold `import()` used to paint ← over an empty body
 * (`loading: () => null`). {@link DisplaysLeafBodySkeleton} holds armed-row
 * density while the chunk lands; {@link preloadUnboxDisplayLeafChunks} warms
 * every deferred leaf when Displays opens so index→leaf is a binary cut.
 */
const loadTicketDisplayHost = () =>
  import('../TicketDisplayHost').then((m) => m.TicketDisplayHost);
const loadPhotosDisplayHost = () =>
  import('../PhotosDisplayHost').then((m) => m.PhotosDisplayHost);
const loadWorkspaceTimelineTab = () =>
  import('@/components/station/workbench').then((m) => m.WorkspaceTimelineTab);
const loadSupportContextHub = () =>
  import('@/components/support/context').then((m) => m.SupportContextHub);
const loadReceivingAuditPanel = () =>
  import('../../ReceivingAuditPanel').then((m) => m.ReceivingAuditPanel);

function LeafBodyLoading() {
  return <DisplaysLeafBodySkeleton />;
}

const TicketDisplayHost = dynamic(loadTicketDisplayHost, {
  loading: LeafBodyLoading,
});
const PhotosDisplayHost = dynamic(loadPhotosDisplayHost, {
  loading: LeafBodyLoading,
});
const WorkspaceTimelineTab = dynamic(loadWorkspaceTimelineTab, {
  loading: LeafBodyLoading,
});
const SupportContextHub = dynamic(loadSupportContextHub, {
  loading: LeafBodyLoading,
});
const ReceivingAuditPanel = dynamic(loadReceivingAuditPanel, {
  loading: LeafBodyLoading,
});

/** Warm deferred Displays leaf chunks once the push column is open. */
export function preloadUnboxDisplayLeafChunks(): void {
  void loadTicketDisplayHost();
  void loadPhotosDisplayHost();
  void loadWorkspaceTimelineTab();
  void loadSupportContextHub();
  void loadReceivingAuditPanel();
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
  /** Inventory dossier — same carton gate as Linkage. */
  hasInventoryTab: boolean;
  poIdForTracking: string;
  hasPoNoteTab: boolean;
  poNote: PoNoteTabState;
  photoAction: UnboxPhotoAction;
  onPhotoActionChange: (action: UnboxPhotoAction) => void;
  /** Photos `link` drill — which PO item the "Link to" combobox defaults to. */
  photoLinkTargetLineId?: number | null;
  /** Photos `link` drill — carton aspect (Shipping label · The box · Packing material). */
  photoLinkTargetCartonAspect?: PhotoAspect | null;
  /** Bump to re-default the "Link to" target from a fresh Link handoff. */
  photoLinkTargetRequestId?: number;
  linkageAction: UnboxLinkageAction;
  onLinkageActionChange: (action: UnboxLinkageAction) => void;
  onInventoryChangePo: () => void;
  onInventorySync: () => void | Promise<
    | { ok: true; zohoNotes: string | null }
    | { ok: false; error: string; painted?: boolean }
    | void
  >;
  inventorySyncing?: boolean;
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
  /**
   * Auto-match "Find ticket" → Ticket Displays (claim · link).
   * Wired on Unbox · Arrival · Testing.
   */
  onFindTicket?: () => void;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
  /** Filled multi-qty unit pencil → open Units display + edit handoff. */
  onEditFilledSerial?: (serial: {
    id: number;
    serial_number: string;
    condition_grade?: string | null;
  }) => void;
  /** Serials cell click → Units Displays. */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /**
   * RETURN match band → Displays Timeline (full serial genealogy).
   * Wired from LineEditPanel `openDisplays('timeline')`.
   */
  onOpenReturnHistory?: () => void;
}

/**
 * The Unbox CENTRE — PO lines (meta = condition · serial ledger) → label preview.
 *
 * Dual loci: centre capture rows own serial/condition/photos; the bottom dock
 * is the notes bubble + Print·Receive (procedure step studio parked on
 * `unbox-work`). Centre `ProcedureDeck` stays parked.
 */
export function buildUnboxOverview(
  input: Pick<
    BuildUnboxTabsInput,
    | 'row'
    | 'staffId'
    | 'c'
    | 'accordionBootstrap'
    | 'onEditFilledSerial'
    | 'onViewAllUnits'
    | 'onOpenReturnHistory'
  > & {
    /** Click ledger chips → focus the matching procedure step in the dock. */
    onFocusCaptureStep?: (key: 'serial' | 'condition' | 'item_photos') => void;
    /**
     * The dock's `activeKey` (`useUnboxProcedureSteps` — the ONE derivation).
     * The active line's capture face lights the moving outline around the
     * segment / condition the dock is asking for. The ledger reads, the dock
     * acts, and the outline ties them — one pointer.
     */
    activeStep?: string | null;
  },
): ReactNode {
  const {
    row,
    staffId,
    c,
    accordionBootstrap = 'default',
    onEditFilledSerial,
    onViewAllUnits,
    onOpenReturnHistory,
    onFocusCaptureStep,
    activeStep = null,
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
        dockOwnsCapture
        onFocusCaptureStep={onFocusCaptureStep}
        activeStep={activeStep}
        c={c}
        suppressItemsHeader
        accordionBootstrap={accordionBootstrap}
        onEditFilledSerial={onEditFilledSerial}
        onViewAllUnits={onViewAllUnits}
        onOpenReturnHistory={onOpenReturnHistory}
      />
      <UnboxLabelPreview row={row} c={c} />
      <UnboxPlacementSection row={row} />
    </div>
  );
}

/**
 * Build the Unbox side displays for the Displays push column.
 *
 * Strip (PO-identity first): Listings · Classify · Pairing · Inventory · Units ·
 * Photos · Ticket · Tracking · Timeline · Support. Ticket is presence-exclusive
 * (Claim vs Chat — no nested tabs). Inventory is one stacked dossier (no nested
 * tabs). Photos is armed-row Actions + URL drills. Units · Linkage still nest
 * parent underline (debt — migrate to armed rows).
 * Checklist is a Displays leaf (no floor % ring).
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
    hasInventoryTab,
    poIdForTracking,
    hasPoNoteTab,
    poNote,
    photoAction,
    onPhotoActionChange,
    photoLinkTargetLineId = null,
    photoLinkTargetCartonAspect = null,
    photoLinkTargetRequestId = 0,
    linkageAction,
    onLinkageActionChange,
    onInventoryChangePo,
    onInventorySync,
    inventorySyncing = false,
    claimMode,
    onCloseClaim,
    onCloseTicket,
    onClaimTicketCreated,
    onClaimTicketUnlinked,
    classifyExpandDimension = null,
    classifyExpandRequestId = 0,
    pairingFocusTab = null,
    pairingFocusRequestId = 0,
    onFindTicket,
    onOpenReturnHistory,
  } = input;

  const ticketId = c.providerTicketId as number | null | undefined;
  const timelineOnStrip = hasTimelineTab && isReturnIntake(row);

  return buildSectionTabs([
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
      id: 'classify',
      label: 'Classify',
      icon: SlidersHorizontal,
      visible: hasClassifyTab,
      // Unfound still promotes Classify on any legacy strip; matched keeps it
      // index-first via UNBOX_STRIP_TAB_ORDER regardless of overflow priority.
      priority: classifyOnStrip ? 'primary' : 'overflow',
      content: (
        <TriageClassifySection
          row={row}
          c={c}
          expandDimension={classifyExpandDimension}
          expandRequestId={classifyExpandRequestId}
          onFindTicket={onFindTicket}
        />
      ),
    },
    {
      id: 'linkage',
      label: 'Pairing',
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
                    onFindTicket,
                  }
                : null
            }
          />
        ) : null,
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Package,
      visible: hasInventoryTab,
      content:
        activeSideTab === 'inventory' ? (
          <InventoryDisplayHost
            row={row}
            hasPoNote={hasPoNoteTab}
            poNote={poNote}
            onChangePo={onInventoryChangePo}
            onSyncFromInventory={onInventorySync}
            syncing={inventorySyncing}
          />
        ) : null,
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
            handleOpenReturnHistory: onOpenReturnHistory,
            serialLookup: c.serialLookup,
          }}
        />
      ),
    },
    {
      id: 'prebox',
      label: 'Prebox',
      icon: Boxes,
      count: serialCount,
      content:
        activeSideTab === 'prebox' ? (
          <PreboxDisplayHost receivingId={row.receiving_id ?? null} />
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
            staffId={Number(staffId) || 0}
            action={photoAction}
            onActionChange={onPhotoActionChange}
            linkTargetLineId={photoLinkTargetLineId}
            linkTargetCartonAspect={photoLinkTargetCartonAspect}
            linkFocusRequestId={photoLinkTargetRequestId}
          />
        ) : null,
    },
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
            // Intake Ticket Displays — no All-good / QC pass·fail chips.
            showReplyPresets={false}
          />
        ) : null,
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      // Flush Displays body — no WorkspaceCard glass island (Classify / Pairing SoT).
      content: <UnboxProcedureChecklist row={row} />,
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
      // Return intake: strip-visible so Full history is one click when Displays
      // is already open. PO/found keeps Timeline in overflow.
      priority: timelineOnStrip ? 'primary' : 'overflow',
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
  ]);
}
