'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { UnitsDisplayHost } from '../UnitsDisplayHost';
import { PreboxDisplayHost } from '../PreboxDisplayHost';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { POUnboxingSection } from '../POUnboxingSection';
import { UnboxProcedureChecklist } from '../UnboxProcedureChecklist';
import { LinkageDisplayHost } from '../LinkageDisplayHost';
import { InventoryDisplayHost } from '../InventoryDisplayHost';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import {
  ClipboardList,
  ExternalLink,
  Images,
  Link2,
  MapPin,
  Boxes,
  Package,
  ScanBarcode,
  Tag,
  Ticket,
} from '@/components/Icons';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { PoNoteTabState } from './usePoNoteTabState';
import type {
  UnboxLinkageAction,
  UnboxPhotoAction,
  UnboxSideTab,
} from '../unbox-side-tabs';
import { TrackingNumbersTab } from '../TrackingNumbersTab';
import { ListingLinksTab } from '../ListingLinksTab';
import { UnboxLocationsLeaf } from '../UnboxLocationsLeaf';
import type { ClaimModalMode } from '../../claim/claim-types';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import {
  StationBandStack,
  type BandCollapseController,
  type LineCollapseController,
} from '@/components/station/collapse';

/** P3 Displays bodies — deferred chunks. */
const loadTicketDisplayHost = () =>
  import('../TicketDisplayHost').then((m) => m.TicketDisplayHost);
const loadPhotosDisplayHost = () =>
  import('../PhotosDisplayHost').then((m) => m.PhotosDisplayHost);

function LeafBodyLoading() {
  return <UniversalLoader isLoading label="Loading display" />;
}

const TicketDisplayHost = dynamic(loadTicketDisplayHost, {
  loading: LeafBodyLoading,
});
const PhotosDisplayHost = dynamic(loadPhotosDisplayHost, {
  loading: LeafBodyLoading,
});

/** Warm deferred Displays leaf chunks once the push column is open. */
export function preloadUnboxDisplayLeafChunks(): void {
  void loadTicketDisplayHost();
  void loadPhotosDisplayHost();
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
  /** Which side tab is showing — gates the lazily-mounted ticket. */
  activeSideTab: UnboxSideTab | null;
  hasUnits: boolean;
  serialCount: number;
  hasTrackingTab: boolean;
  hasListingsTab: boolean;
  /** Linkage (Pairing + Zoho note) needs a carton record. */
  hasLinkageTab: boolean;
  /** Inventory dossier — same carton gate as Linkage. */
  hasInventoryTab: boolean;
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
  /** Bump to re-open the same dimension from the header. */
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
}

/** The Unbox CENTRE — PO lines (meta = condition · serial ledger) → label preview. */
export function buildUnboxOverview(
  input: Pick<
    BuildUnboxTabsInput,
    | 'row'
    | 'staffId'
    | 'c'
    | 'accordionBootstrap'
    | 'onEditFilledSerial'
    | 'onViewAllUnits'
  > & {
    /** Click ledger chips → focus the matching procedure step in the dock. */
    onFocusCaptureStep?: (key: 'serial' | 'condition' | 'item_photos') => void;
    /** The dock's `activeKey` (`useUnboxProcedureSteps` — the ONE derivation). */
    activeStep?: string | null;
    /**
     * When set, Items · Label render as one {@link StationBandStack} — a
     * full-width accordion row each. Click the row to open or close it.
     * The Label row IS show / hide for the sticker (no nested CTA).
     */
    collapse?: {
      bands: BandCollapseController;
      collapseAll?: () => void;
    };
    /** Per-LINE disclosure inside the Items band ({@link useLineCollapse}). */
    lineCollapse?: LineCollapseController;
  },
): ReactNode {
  const {
    row,
    staffId,
    c,
    accordionBootstrap = 'default',
    onEditFilledSerial,
    onViewAllUnits,
    onFocusCaptureStep,
    activeStep = null,
    collapse,
    lineCollapse,
  } = input;

  const items = (
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
      lineCollapse={lineCollapse}
    />
  );
  const label = (
    <UnboxLabelPreview
      row={row}
      c={c}
      onReveal={collapse ? () => collapse.bands.open('label') : undefined}
    />
  );

  if (!collapse) {
    return (
      <div className="space-y-0">
        {items}
        {label}
      </div>
    );
  }

  return (
    <StationBandStack
      collapse={collapse.bands}
      // Declared order IS the reading order.
      bands={[
        {
          id: 'items',
          label: 'Items',
          icon: Boxes,
          body: items,
          testId: 'unbox-band-items',
        },
        {
          id: 'label',
          label: 'Label',
          icon: Tag,
          body: label,
          testId: 'unbox-band-label',
        },
      ]}
      onCollapseAll={
        collapse.collapseAll
          ? () => {
              // Both altitudes, one press. Collapsing only the bands would give
              // the column back and then hand it straight back to N expanded
              // capture bars the moment the operator re-opened Items.
              collapse.collapseAll?.();
              lineCollapse?.collapseAll();
            }
          : undefined
      }
    />
  );
}

/** Build the Unbox side displays for the Displays push column. */
export function buildUnboxSideTabs(input: BuildUnboxTabsInput): SectionTab[] {
  const {
    row,
    staffId,
    c,
    activeSideTab,
    hasUnits,
    serialCount,
    hasTrackingTab,
    hasListingsTab,
    hasLinkageTab,
    hasInventoryTab,
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
    pairingFocusTab = null,
    pairingFocusRequestId = 0,
    onFindTicket,
  } = input;

  const ticketId = c.providerTicketId as number | null | undefined;

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
          receivingId={row.receiving_id ?? null}
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
            onFindTicket={onFindTicket}
            ticketLabel={c.supportTicket?.label ?? null}
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
      icon: ScanBarcode,
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
          />
        ) : null,
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      // Flush Displays body — no WorkspaceCard glass island (Pairing SoT).
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
      id: 'locations',
      label: 'Locations',
      icon: MapPin,
      priority: 'overflow',
      // Mount only while showing — the catalog read is a station-wide list and
      // has no business firing behind every other leaf.
      content:
        activeSideTab === 'locations' ? (
          <UnboxLocationsLeaf
            lineId={row.id ?? null}
            stagedLocationId={row.staged_location_id ?? null}
            onPlaced={onCloseTicket}
          />
        ) : null,
    },
  ]);
}
