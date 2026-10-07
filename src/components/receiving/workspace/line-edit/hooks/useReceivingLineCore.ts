'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { useEventBridge, useResourceMutation } from '@/hooks';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { sendToDevice, type DeviceAckChannel } from '@/lib/realtime/device-handshake';
import { copyToClipboard } from '@/utils/_dom';
import { buildReceivingCopyInfo } from '@/utils/copy-all-receiving';
import { useEntitySupportTicket } from '@/hooks/useEntitySupportTicket';
import { resolveTrackingOpenUrl } from '@/lib/tracking-format';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import { useSkuIdentity } from '@/hooks/useSkuIdentity';
import { collectCartonListingLinks, normalizeListingHref } from '@/lib/receiving/listing-links';
import { displayTrackingNumber } from '@/lib/receiving/fulfillment-mode';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import {
  patchUnboxRailQtyByCarton,
  patchUnboxRailTitleByCarton,
  upsertReceivingRailRows,
} from '@/lib/queries/receiving-queries';
import { useQueryClient } from '@tanstack/react-query';
import {
  readReceivingLineDetailsScratch,
  writeReceivingLineDetailsScratch,
  receivingShareUrl,
  randomId,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { usePoBinding } from './usePoBinding';
import { useSourcePlatform } from './useSourcePlatform';
import { useReceivingType } from './useReceivingType';
import { useReceivingPackageSync } from './useReceivingPackageSync';
import { useZohoSync } from './useZohoSync';
import { useReceivingCartonRealtimeBridge } from './useReceivingCartonRealtime';

/** Mode-AGNOSTIC controller for a single receiving line's carton-level concerns — the slice every workspace mode (unbox · triage · testing)… */
export function useReceivingLineCore(
  row: ReceivingLineRow,
  staffId: string,
  opts: { dispatchLine?: (patch: Partial<ReceivingLineRow> & { id: number }) => void } = {},
) {
  const dispatchLine = opts.dispatchLine ?? dispatchLineUpdated;
  const queryClient = useQueryClient();

  /** Keep the Unboxed dock in sync without inventing membership. */
  const upsertUnboxRailRow = useCallback(
    (line: Partial<ReceivingLineRow> & { id: number }) => {
      const receivingId = line.receiving_id ?? row.receiving_id ?? null;
      if (receivingId == null || !Number.isFinite(receivingId)) return;
      const hasTitle =
        'item_name' in line
        || 'sku' in line
        || 'catalog_product_title' in line
        || 'zoho_item_title' in line
        || 'zoho_purchaseorder_number' in line;
      const hasQty =
        'quantity_received' in line
        || 'quantity_expected' in line
        || 'workflow_status' in line;
      if (hasTitle) {
        const titlePatch: {
          item_name?: string | null;
          catalog_product_title?: string | null;
          zoho_item_title?: string | null;
          sku?: string | null;
          zoho_purchaseorder_number?: string | null;
        } = {};
        if ('item_name' in line) titlePatch.item_name = line.item_name;
        if ('catalog_product_title' in line) titlePatch.catalog_product_title = line.catalog_product_title;
        if ('zoho_item_title' in line) titlePatch.zoho_item_title = line.zoho_item_title;
        if ('sku' in line) titlePatch.sku = line.sku;
        if ('zoho_purchaseorder_number' in line) {
          titlePatch.zoho_purchaseorder_number = line.zoho_purchaseorder_number;
        }
        patchUnboxRailTitleByCarton(queryClient, receivingId, titlePatch);
      }
      if (hasQty) {
        const qtyPatch: {
          quantity_received?: number;
          quantity_expected?: number | null;
          workflow_status?: string | null;
        } = {};
        if ('quantity_received' in line && line.quantity_received != null) {
          qtyPatch.quantity_received = line.quantity_received;
        }
        if ('quantity_expected' in line) qtyPatch.quantity_expected = line.quantity_expected;
        if ('workflow_status' in line) qtyPatch.workflow_status = line.workflow_status;
        patchUnboxRailQtyByCarton(queryClient, receivingId, qtyPatch);
      }
      // Refresh carton reconcile id only — mergeRailRows skips identity-only
      // prepend when the carton is not already on the Unboxed dock.
      upsertReceivingRailRows(queryClient, [
        {
          id: line.id,
          receiving_id: receivingId,
          client_event_id: line.client_event_id ?? `carton:${receivingId}`,
        },
      ]);
    },
    [queryClient, row.receiving_id],
  );
  const [zendesk, setZendesk] = useState('');
  const supportTicketQuery = useEntitySupportTicket({
    lineId: row.id ?? null,
    receivingId: row.receiving_id ?? null,
    // Pending scan stubs + lineless pre-open must not hit by-entity (negative
    // hash must never become a fake carton id).
    enabled: row.receiving_id != null,
    initialTicket: row.linked_support_ticket ?? null,
  });
  const supportTicket = supportTicketQuery.data ?? null;
  const [listingLink, setListingLink] = useState('');
  const [trackingEdit, setTrackingEdit] = useState(displayTrackingNumber(row) || '');
  const [extraTrackings, setExtraTrackings] = useState<string[]>([]);
  /** Tracking inline editor — collapsed by default; pencil expands. */
  const [trackingEditorsOpen, setTrackingEditorsOpen] = useState(false);
  /** Full listing SearchBar — collapsed by default; pencil expands to paste/edit. */
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  // Carton-level manual priority tier (receiving.priority_tier): null = Auto,
  // 0..3 = Priority/High/Medium/Low. Optimistic local mirror so the urgency
  // pill updates instantly; the PATCH targets the carton.
  const [priorityTier, setPriorityTier] = useState<number | null>(
    row.priority_tier ?? (row.is_priority ? 0 : null),
  );
  const [auditOpen, setAuditOpenRaw] = useState(false);
  const [photoNoteOpen, setPhotoNoteOpenRaw] = useState(false);
  const [movePhotosOpen, setMovePhotosOpenRaw] = useState(false);
  const [movePhotosKey, setMovePhotosKey] = useState(0);
  const movePhotosReopenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyingAll, setCopyingAll] = useState(false);
  const [phoneSharing, setPhoneSharing] = useState(false);
  const { getClient: getAblyClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;

  /** One Unbox tool push at a time — opening any closes the other two. */
  const setAuditOpen = useCallback((on: boolean) => {
    if (on) {
      setPhotoNoteOpenRaw(false);
      setMovePhotosOpenRaw(false);
    }
    setAuditOpenRaw(on);
  }, []);

  const setPhotoNoteOpen = useCallback((on: boolean) => {
    if (on) {
      setAuditOpenRaw(false);
      setMovePhotosOpenRaw(false);
    }
    setPhotoNoteOpenRaw(on);
  }, []);

  const setMovePhotosOpen = useCallback((on: boolean) => {
    if (on) {
      setAuditOpenRaw(false);
      setPhotoNoteOpenRaw(false);
    }
    setMovePhotosOpenRaw(on);
  }, []);

  /** Close all three tool-push surfaces (Claim/Ticket/details took the slot). */
  const closeToolPush = useCallback(() => {
    setAuditOpenRaw(false);
    setPhotoNoteOpenRaw(false);
    setMovePhotosOpenRaw(false);
  }, []);

  useEffect(
    () => () => {
      if (movePhotosReopenTimer.current != null) clearTimeout(movePhotosReopenTimer.current);
    },
    [],
  );

  /** Soft-close + reopen so picker state resets when the header action is re-clicked. */
  const openMovePhotos = useCallback(() => {
    if (movePhotosReopenTimer.current != null) {
      clearTimeout(movePhotosReopenTimer.current);
      movePhotosReopenTimer.current = null;
    }
    if (movePhotosOpen) {
      setMovePhotosOpen(false);
      movePhotosReopenTimer.current = setTimeout(() => {
        setMovePhotosKey((k) => k + 1);
        setMovePhotosOpen(true);
        movePhotosReopenTimer.current = null;
      }, 180);
      return;
    }
    setMovePhotosKey((k) => k + 1);
    setMovePhotosOpen(true);
  }, [movePhotosOpen, setMovePhotosOpen]);
  const { poEditorOpen, setPoEditorOpen, poNumberEdit, setPoNumberEdit, persistPoNumber } =
    usePoBinding(row);
  const { sourcePlatform, setSourcePlatform, platformSaving, savePlatform } = useSourcePlatform(
    row,
    { listingLink },
  );
  const isUnmatched = row.receiving_source === 'unmatched';
  const isZohoPo =
    row.receiving_source === 'zoho_po' ||
    Boolean((row.zoho_purchaseorder_id || '').trim());
  const skuIdentity = useSkuIdentity(isUnmatched ? null : row.sku, sourcePlatform || row.source_platform);
  const listingLinks = useMemo(
    () =>
      collectCartonListingLinks({
        listingLink,
        syncNotes: row.receiving_zoho_notes ?? null,
        sku: row.sku,
        sourcePlatform,
        isUnmatched,
        suppressEcwidStorefront: isZohoPo,
        platforms: skuIdentity.platforms,
      }),
    [listingLink, row.receiving_zoho_notes, row.sku, sourcePlatform, isUnmatched, isZohoPo, skuIdentity.platforms],
  );
  const { intakeType: receivingType, setIntakeType: setReceivingType, saveType } =
    useReceivingType(row);

  // Refs synced each render so the carton-switch flush effect reads the latest
  // values without re-subscribing.
  const persistZendeskRef = useRef(zendesk);
  const persistListingRef = useRef(listingLink);
  const persistExtraTrackingsRef = useRef(extraTrackings);
  persistZendeskRef.current = zendesk;
  persistListingRef.current = listingLink;
  persistExtraTrackingsRef.current = extraTrackings;

  const toggleTrackingEditors = useCallback(() => {
    setTrackingEditorsOpen((prev) => {
      const next = !prev;
      if (prev && !next) {
        setExtraTrackings((xs) => xs.filter((t) => t.trim().length > 0));
      }
      return next;
    });
  }, []);

  // Reset the carton-level edit buffers on line/carton change. (Condition/serial
  // resets live in the per-mode controller.)
  useEffect(() => {
    // displayTrackingNumber, not the raw column — suppresses pickup placeholders
    // AND a scanned value that turned out to be the PO# re-echoed into the
    // tracking slot (fulfillment-mode.ts), never a real carrier tracking#.
    setTrackingEdit(displayTrackingNumber(row) || '');
    setPriorityTier(row.priority_tier ?? (row.is_priority ? 0 : null));
  }, [row.id, row.tracking_number, row.is_priority, row.priority_tier]);

  // When the carton changes, flush scratch for the previous receiving_id so
  // localStorage is not lost before loading the next carton's scratch.
  const prevReceivingIdForFlushRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevReceivingIdForFlushRef.current;
    const next = row.receiving_id;
    if (prev != null && prev !== next) {
      writeReceivingLineDetailsScratch(prev, {
        zendesk: persistZendeskRef.current,
        listing: persistListingRef.current,
        extra_trackings: persistExtraTrackingsRef.current.filter((t) => t.trim().length > 0),
      }, orgId);
    }
    prevReceivingIdForFlushRef.current = next ?? null;
  }, [row.receiving_id, orgId]);

  // Restore Zendesk + listing + extra trackings from localStorage when switching
  // cartons (layout phase so the persist effect sees hydrated values).
  useLayoutEffect(() => {
    if (row.receiving_id == null) {
      setZendesk('');
      setListingLink('');
      setExtraTrackings([]);
      setListingEditorOpen(false);
      setTrackingEditorsOpen(false);
      return;
    }
    const d = readReceivingLineDetailsScratch(row.receiving_id, orgId);
    // Ticket display comes from support_tickets + ticket_links (not receiving columns).
    setZendesk(d.zendesk);
    // DB-persisted listing URL wins over the per-browser scratch when present.
    setListingLink((row.receiving_listing_url || '').trim() || d.listing);
    const extras = d.extra_trackings.length > 0 ? d.extra_trackings : [];
    setExtraTrackings(extras);
    setTrackingEditorsOpen(false);
  }, [row.receiving_id, row.tracking_number, orgId]);

  /** Listing chip/editor: always start minimized when the selected line/carton changes. */
  useLayoutEffect(() => {
    setListingEditorOpen(false);
  }, [row.id, row.receiving_id]);

  // Persist scratch per carton. Skip one write right after receiving_id changes
  // (flush already saved the previous carton; load hydrates this one).
  const previousReceivingIdForPersistRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const prev = previousReceivingIdForPersistRef.current;
    const cur = row.receiving_id;
    if (cur == null) {
      previousReceivingIdForPersistRef.current = cur;
      return;
    }
    const transitioned = prev !== cur && prev !== undefined;
    previousReceivingIdForPersistRef.current = cur;
    if (transitioned) return;
    writeReceivingLineDetailsScratch(cur, {
      zendesk,
      listing: listingLink,
      extra_trackings: extraTrackings.map((t) => t.trim()).filter(Boolean),
    }, orgId);
  }, [zendesk, listingLink, extraTrackings, row.receiving_id, orgId]);

  // NOTE: the Zendesk ticket link is owned end-to-end by the claim modal (create / link-existing) and the ReceivingTicketChip's Unlink…

  // Set/clear the carton's manual priority tier (receiving.priority_tier) from
  // the urgency pill. null = Auto. Optimistic; reverts on failure.
  const handlePrioritySelect = useCallback(async (next: number | null) => {
    if (row.receiving_id == null) {
      toast.error('Link a PO first to set priority');
      return;
    }
    const prev = priorityTier;
    if (next === prev) return;
    setPriorityTier(next);
    try {
      const res = await fetch('/api/receiving-logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.receiving_id, priority_tier: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setPriorityTier(prev);
        toast.error(data?.error || 'Could not update priority');
        return;
      }
      dispatchLine({
        id: row.id,
        is_priority: next === 0,
        priority_tier: next,
        notes: row.notes,
      });
    } catch {
      setPriorityTier(prev);
      toast.error('Could not update priority');
    }
  }, [row.receiving_id, row.id, row.notes, priorityTier]);
  // Cross-viewer classify sync:
  useReceivingCartonRealtimeBridge(row.receiving_id ?? null);
  useEventBridge({
    'receiving-package-updated': (e) => {
      if (row.receiving_id == null) return;
      const detail = (
        e as CustomEvent<{ receiving_id?: number; priority_tier?: number | null }>
      ).detail;
      if (!detail || detail.receiving_id !== row.receiving_id) return;
      if (detail.priority_tier === undefined) return;
      setPriorityTier(detail.priority_tier);
    },
  });

  // Persist listing_url to the carton (debounced) + mirror listing/platform
  // changes on other surfaces for this carton.
  useReceivingPackageSync({ row, listingLink, setListingLink, setSourcePlatform });
  const patchMut = useResourceMutation(async (fields: Record<string, unknown>) => {
    const res = await fetch('/api/receiving-lines', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, ...fields }),
    });
    const data = await res.json();
    if (data?.success && data.receiving_line) {
      const line = data.receiving_line as ReceivingLineRow;
      dispatchLine(line);
      // Tracking / carton field edits must upsert by id — never rely on a full
      // feed refetch that can race empty and blank the Unboxed rail.
      upsertUnboxRailRow(line);
    }
    return data;
  });
  const saving = patchMut.isPending;
  const patchMutate = patchMut.mutate;
  // Fire-and-forget line patch (callers don't await). Stable identity so the
  // CartonContextCard children don't re-render on every keystroke.
  const patch = useCallback(
    (fields: Record<string, unknown>) => { patchMutate(fields); },
    [patchMutate],
  );

  // Attach an EXTRA tracking number as another box on this carton's PO via the
  // receiving_shipments junction. The primary tracking stays the Zoho reference#
  // anchor. docs/multi-tracking-po-plan.md.
  const attachExtraBox = useCallback(
    async (rawTracking: string, index: number) => {
      const tracking = rawTracking.trim();
      if (!tracking) return;
      if (row.receiving_id == null) {
        toast.error('Link a PO first, then add boxes');
        return;
      }
      try {
        const res = await fetch(`/api/receiving/${row.receiving_id}/attach-box`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingNumber: tracking }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data?.success) {
          toast.error(data?.error || 'Could not link tracking number');
          return;
        }
        if (data.already_attached) {
          toast.success('Tracking already linked to this PO');
        } else {
          const poLabel = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim() || 'this PO';
          toast.success(`Box ${data.box_count} linked to ${poLabel}`);
        }
        setExtraTrackings((xs) => xs.map((x, j) => (j === index ? '' : x)));
        // Sort-safe bus patch + id-scoped Unboxed cache upsert (do not remove the row).
        const patch = { id: row.id, notes: row.notes, receiving_id: row.receiving_id };
        dispatchLine(patch);
        upsertUnboxRailRow(patch);
      } catch {
        toast.error('Could not link tracking number');
      }
    },
    [
      row.receiving_id,
      row.id,
      row.notes,
      row.zoho_purchaseorder_number,
      row.zoho_purchaseorder_id,
      dispatchLine,
      upsertUnboxRailRow,
    ],
  );

  const {
    zohoSyncing,
    inventoryRefreshing,
    syncWithZoho,
    syncCartonFromZoho,
    refreshInventoryDossier,
  } = useZohoSync(row, {
    staffId,
    listingLink,
    zendesk,
    setListingLink,
    setZendesk,
    dispatchLine,
  });

  const handleShare = useCallback(async () => {
    if (!row.receiving_id) {
      toast.error('No receiving package linked yet');
      return;
    }
    const url = receivingShareUrl(row.receiving_id, row.id);
    const poLabel = row.zoho_purchaseorder_number || `Package #${row.receiving_id}`;
    const title = `Receiving — ${poLabel}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
    const ok = await copyToClipboard(url);
    if (ok) toast.success('Link copied to clipboard');
    else toast.error('Could not copy link');
  }, [row.receiving_id, row.zoho_purchaseorder_number, row.id]);

  // Push a "Shared from computer" sheet to the operator's paired phone via `staffstation:{staffId}` — implicit pairing, the (orgId, staffId)…
  const handleSharePhone = useCallback(async () => {
    if (!row.receiving_id) {
      toast.error('No receiving package linked yet');
      return;
    }
    const staffIdNum = Number(staffId) || 0;
    if (staffIdNum <= 0) {
      toast.error('Sign in to share to your phone');
      return;
    }
    // safeChannelName only returns '' when orgChannelPrefix throws — i.e. a
    // missing/non-uuid org id. staffId is already validated above, so an empty
    // name here is specifically an org-linkage problem; message it as such.
    const stationChannelName = safeChannelName(() =>
      getStaffStationBridgeChannelName(orgId!, staffIdNum),
    );
    if (!stationChannelName) {
      toast.error('Your account has no organization yet — sign out and back in.');
      return;
    }
    setPhoneSharing(true);
    try {
      const client = await getAblyClient();
      if (!client) {
        toast.error('Realtime unavailable — try again');
        return;
      }
      const requestId = randomId();
      const ch = client.channels.get(stationChannelName);

      // This inline subscribe-before-publish/race-a-timeout dance used to live here and nowhere else, which is why the photo-request and pack…
      const acked = await sendToDevice({
        channel: ch as DeviceAckChannel,
        requestId,
        publish: () =>
          ch.publish('receiving_share_to_phone', {
            receiving_id: row.receiving_id,
            po_label: row.zoho_purchaseorder_number || `Package #${row.receiving_id}`,
            tracking: (row.tracking_number || '').trim() || null,
            request_id: requestId,
            requested_by_staff_id: staffIdNum,
          }),
      });

      if (acked) {
        toast.success('Shared to your phone');
      } else {
        toast.error(
          'No phone picked it up — open the app on your phone signed in to the same account, then try again.',
        );
      }
    } catch {
      toast.error('Could not share to phone');
    } finally {
      setPhoneSharing(false);
    }
  }, [row.receiving_id, row.zoho_purchaseorder_number, row.tracking_number, staffId, orgId, getAblyClient]);

  const ticketLabel = supportTicket?.label ?? '';
  const ticketChipDisplay =
    supportTicket?.providerTicketId != null
      ? String(supportTicket.providerTicketId)
      : supportTicket
        ? String(supportTicket.id)
        : '';
  const ticketHref = supportTicket?.openUrl ?? null;
  const providerTicketId = supportTicket?.providerTicketId ?? null;

  const handleCopyAll = useCallback(async () => {
    if (!row.receiving_id) {
      toast.error('No receiving package linked yet');
      return;
    }
    setCopyingAll(true);
    try {
      const res = await fetch(`/api/receiving/${row.receiving_id}`, { cache: 'no-store' });
      const data = await res.json();
      const lines = data?.success && Array.isArray(data.lines) ? data.lines : [];
      const shareUrl = receivingShareUrl(row.receiving_id, row.id);
      const text = buildReceivingCopyInfo({
        carton: data?.success ? data.receiving : null,
        lines,
        scratch: {
          zendesk: ticketLabel || zendesk,
          listing: listingLink,
          extraTrackings: extraTrackings.filter((t) => t.trim().length > 0),
        },
        currentLine: row,
        shareUrl,
      });
      const ok = await copyToClipboard(text);
      if (ok) toast.success('Copied receiving details');
      else toast.error('Could not copy to clipboard');
    } catch {
      toast.error('Failed to build copy text');
    } finally {
      setCopyingAll(false);
    }
  }, [row, zendesk, ticketLabel, listingLink, extraTrackings]);

  // ── Derived identity values shared by the carton chip row ──────────────────
  const poNumber = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  // Listing link: an explicit pasted URL wins; otherwise derive from catalog
  // platform rows + storefront search by SKU (collectCartonListingLinks).
  // Zoho PO: never invent a usavshop/Ecwid URL from the inventory SKU.
  const listingOpenHref =
    listingLinks[0]?.href ??
    (normalizeListingHref(listingLink) ||
      (isUnmatched || isZohoPo ? null : getExternalUrlByItemNumber(row.sku)));
  const poOpenHref = (() => {
    const id = (row.zoho_purchaseorder_id || '').trim();
    if (id) return `https://inventory.zoho.com/app#/purchaseorders/${encodeURIComponent(id)}`;
    if (poNumber) return `https://inventory.zoho.com/app#/purchaseorders?search_text=${encodeURIComponent(poNumber)}`;
    return null;
  })();
  const zendeskTrimmed = ticketLabel;
  const zendeskHref = ticketHref;
  const zendeskChipDisplay = ticketChipDisplay;
  const primaryTrackingTrimmed = trackingEdit.trim();
  const filledExtraTrackingsCount = extraTrackings.filter((t) => t.trim().length > 0).length;
  const trackingOpenHref = primaryTrackingTrimmed
    ? resolveTrackingOpenUrl(primaryTrackingTrimmed, row.carrier)
    : null;

  return {
    // carton identity state
    zendesk, setZendesk,
    listingLink, setListingLink,
    listingEditorOpen, setListingEditorOpen,
    trackingEdit, setTrackingEdit,
    trackingEditorsOpen, toggleTrackingEditors,
    extraTrackings, setExtraTrackings,
    priorityTier,
    auditOpen, setAuditOpen,
    photoNoteOpen, setPhotoNoteOpen,
    movePhotosOpen, setMovePhotosOpen, movePhotosKey, openMovePhotos,
    closeToolPush,
    copyingAll,
    phoneSharing,
    // composed carton hooks
    poEditorOpen, setPoEditorOpen, poNumberEdit, setPoNumberEdit, persistPoNumber,
    sourcePlatform, setSourcePlatform, platformSaving, savePlatform,
    receivingType, setReceivingType, saveType,
    zohoSyncing, inventoryRefreshing, syncWithZoho, syncCartonFromZoho, refreshInventoryDossier,
    // line patch
    patch, saving,
    // actions
    handlePrioritySelect, attachExtraBox,
    handleShare, handleSharePhone, handleCopyAll,
    // derived
    poNumber, listingOpenHref, listingLinks, poOpenHref,
    zendeskTrimmed, zendeskHref, zendeskChipDisplay,
    supportTicket, providerTicketId,
    invalidateSupportTicket: () => void supportTicketQuery.refetch(),
    primaryTrackingTrimmed, filledExtraTrackingsCount, trackingOpenHref,
  };
}

export type ReceivingLineCore = ReturnType<typeof useReceivingLineCore>;
