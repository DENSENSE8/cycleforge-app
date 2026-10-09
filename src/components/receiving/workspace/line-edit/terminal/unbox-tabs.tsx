'use client';

/** Unbox Displays leaf bodies for the right-edge push column ({@link StationDisplaysPushStack}). */

import dynamic from 'next/dynamic';
import type { SectionTab } from '@/design-system/components';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { buildSectionTabs } from '@/components/station/workbench';
import {
  Boxes,
  ClipboardList,
  ExternalLink,
  History,
  Images,
  Link2,
  MapPin,
  Package,
  ScanBarcode,
  Truck,
} from '@/components/Icons';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { UnboxLineController } from '../unbox-line-controller';
import type { InventoryDossierRefreshResult } from '../hooks/useZohoSync';
import type { LinkageAutoMatch } from '../LinkageDisplayHost';
import { ListingLinksTab } from '../ListingLinksTab';
import { TrackingNumbersEditor } from '../TrackingNumbersEditor';
import type { PoNoteTabState } from './usePoNoteTabState';
import type {
  UnboxLinkageAction,
  UnboxPhotoAction,
  UnboxSideTab,
  UnboxSideTabGates,
} from '../unbox-side-tabs';

const leafLoading = () => <SkeletonList count={3} />;
const UnitsDisplayHost = dynamic(
  () => import('../UnitsDisplayHost').then((m) => m.UnitsDisplayHost),
  { ssr: false, loading: leafLoading },
);
const PreboxDisplayHost = dynamic(
  () => import('../PreboxDisplayHost').then((m) => m.PreboxDisplayHost),
  { ssr: false, loading: leafLoading },
);
const LinkageDisplayHost = dynamic(
  () => import('../LinkageDisplayHost').then((m) => m.LinkageDisplayHost),
  { ssr: false, loading: leafLoading },
);
const InventoryDisplayHost = dynamic(
  () => import('../InventoryDisplayHost').then((m) => m.InventoryDisplayHost),
  { ssr: false, loading: leafLoading },
);
const PhotosDisplayHost = dynamic(
  () => import('../PhotosDisplayHost').then((m) => m.PhotosDisplayHost),
  { ssr: false, loading: leafLoading },
);
const UnboxProcedureChecklist = dynamic(
  () => import('../UnboxProcedureChecklist').then((m) => m.UnboxProcedureChecklist),
  { ssr: false, loading: leafLoading },
);
const UnboxLocationsLeaf = dynamic(
  () => import('../UnboxLocationsLeaf').then((m) => m.UnboxLocationsLeaf),
  { ssr: false, loading: leafLoading },
);
const WorkspaceTimelineTab = dynamic(
  () => import('@/components/station/workbench/WorkspaceTimelineTab').then((m) => m.WorkspaceTimelineTab),
  { ssr: false, loading: leafLoading },
);
const ReceivingAuditPanel = dynamic(
  () => import('../../ReceivingAuditPanel').then((m) => m.ReceivingAuditPanel),
  { ssr: false, loading: leafLoading },
);

interface BuildUnboxSideTabsInput {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  /** The leaf on screen — heavy bodies mount only while showing. */
  activeSideTab: UnboxSideTab | null;
  gates: UnboxSideTabGates;
  serialCount: number;
  poNote: PoNoteTabState;
  photoAction: UnboxPhotoAction;
  onPhotoActionChange: (action: UnboxPhotoAction) => void;
  /** Photos `link` drill — which PO item the "Link to" combobox defaults to. */
  photoLinkTargetLineId: number | null;
  /** Photos `link` drill — carton aspect (Shipping label · The box · Packing material). */
  photoLinkTargetCartonAspect: PhotoAspect | null;
  /** Bump to re-default the "Link to" target from a fresh Link handoff. */
  photoLinkTargetRequestId: number;
  linkageAction: UnboxLinkageAction;
  onLinkageActionChange: (action: UnboxLinkageAction) => void;
  /** Link / Change PO → the header Pair task. */
  onOpenPairing: () => void;
  /** Find ticket → the header Ticket task. */
  onFindTicket: () => void;
  onInventorySync: () => void | Promise<InventoryDossierRefreshResult | void>;
  /** Back to the Root Index (Locations placed · Timeline audit close). */
  onBackToIndex: () => void;
}

/** Build the Unbox leaves for the Displays push column. */
export function buildUnboxSideTabs(input: BuildUnboxSideTabsInput): SectionTab[] {
  const {
    row,
    staffId,
    c,
    activeSideTab,
    gates,
    serialCount,
    poNote,
    photoAction,
    onPhotoActionChange,
    photoLinkTargetLineId,
    photoLinkTargetCartonAspect,
    photoLinkTargetRequestId,
    linkageAction,
    onLinkageActionChange,
    onOpenPairing,
    onFindTicket,
    onInventorySync,
    onBackToIndex,
  } = input;

  const autoMatch: LinkageAutoMatch | null = c.isUnfound
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
    : null;

  return buildSectionTabs([
    {
      id: 'listings',
      label: 'Listings',
      icon: ExternalLink,
      visible: gates.hasListingsTab,
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
      visible: gates.hasLinkageTab,
      content:
        activeSideTab === 'linkage' ? (
          <LinkageDisplayHost
            action={linkageAction}
            onActionChange={onLinkageActionChange}
            onLink={onOpenPairing}
            hasPoNote={gates.hasPoNoteTab}
            poNote={poNote}
            autoMatch={autoMatch}
            onFindTicket={onFindTicket}
            ticketLabel={c.supportTicket?.label ?? null}
          />
        ) : null,
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Package,
      visible: gates.hasInventoryTab,
      content:
        activeSideTab === 'inventory' ? (
          <InventoryDisplayHost
            row={row}
            hasPoNote={gates.hasPoNoteTab}
            poNote={poNote}
            onChangePo={onOpenPairing}
            onSyncFromInventory={onInventorySync}
            syncing={Boolean(c.inventoryRefreshing)}
          />
        ) : null,
    },
    {
      id: 'units',
      label: 'Units',
      icon: ScanBarcode,
      count: serialCount,
      visible: gates.hasUnits,
      content:
        activeSideTab === 'units' ? (
          <UnitsDisplayHost
            receivingId={row.receiving_id ?? null}
            activeLineId={row.id ?? null}
            staffId={staffId}
            c={c}
          />
        ) : null,
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
    // No `ticket` leaf: its Root Index row hands off to the header Ticket task.
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      content: activeSideTab === 'checklist' ? <UnboxProcedureChecklist row={row} /> : null,
    },
    {
      id: 'tracking',
      label: 'Tracking',
      icon: Truck,
      priority: 'overflow',
      visible: gates.hasTrackingTab,
      content: (
        <TrackingNumbersEditor
          autoFocus={activeSideTab === 'tracking'}
          trackingEdit={c.trackingEdit}
          setTrackingEdit={c.setTrackingEdit}
          onCommitTracking={(value) => {
            const trimmed = value.trim();
            if (trimmed !== (row.tracking_number || '').trim()) {
              c.patch({ zoho_reference_number: trimmed || null });
            }
          }}
          extraTrackings={c.extraTrackings}
          setExtraTrackings={c.setExtraTrackings}
          onCommitExtraTracking={(value, index) => void c.attachExtraBox(value, index)}
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
            onPlaced={onBackToIndex}
          />
        ) : null,
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      priority: 'overflow',
      visible: gates.hasTimelineTab,
      content:
        activeSideTab === 'timeline' && row.receiving_id != null ? (
          <div className="space-y-4">
            <WorkspaceTimelineTab
              poId={row.zoho_purchaseorder_id || null}
              tracking={row.tracking_number ?? null}
              receivingId={row.receiving_id}
            />
            <ReceivingAuditPanel
              open
              receivingId={row.receiving_id}
              onClose={onBackToIndex}
              hideHeader
            />
          </div>
        ) : null,
    },
  ]);
}
