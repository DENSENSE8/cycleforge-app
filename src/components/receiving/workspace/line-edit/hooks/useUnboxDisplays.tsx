'use client';

/**
 * Unbox Displays — the right-edge push column's leaves, Root Index, macro floor
 * and nest state (Photos / Pairing drills, Photo-link target), driven by the
 * shared station task controller (`activeDisplay` · `openDisplay`).
 *
 * Photos (gallery), Ticket and Pair stay header tasks: the Ticket index row,
 * Pairing's Link verb and Inventory's Change PO hand off to them rather than
 * mounting a second copy of their bodies.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartonDisplaysActionFloor,
  STATION_DISPLAY_INDEX,
  isDisplaysHostedLeaf,
  type DisplaysVisitFrame,
} from '@/components/station/displays';
import type { StationTask } from '@/components/station/station-header-tasks';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { nudgeUnboxPrintReceive } from '@/lib/keyboard/shortcut-nudge';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';
import { WorkspaceActionFeedbackSlot } from '../../WorkspaceActionFeedbackSlot';
import { buildUnboxSideTabs } from '../terminal/unbox-tabs';
import { usePoNoteTabState } from '../terminal/usePoNoteTabState';
import { buildUnboxDisplayIndexRows } from '../unbox-display-index';
import type { UnboxLineController } from '../unbox-line-controller';
import {
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  resolveUnboxSideTab,
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTab,
  type UnboxSideTabGates,
} from '../unbox-side-tabs';
import { useSyncedPoNote } from './useSyncedPoNote';

type UnboxLeafNest = {
  photoAction?: UnboxPhotoAction;
  linkageAction?: UnboxLinkageAction;
};

export function useUnboxDisplays({
  row,
  staffId,
  c,
  activeDisplay,
  displaysOpen,
  openDisplay,
  closeDisplays,
  selectTask,
  returnOrderFound,
}: {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  activeDisplay: string | null;
  displaysOpen: boolean;
  openDisplay: (displayId: string) => void;
  closeDisplays: () => void;
  selectTask: (task: StationTask) => void;
  /** A scanned serial traced to a packed/shipped order — Pairing never shows. */
  returnOrderFound: boolean;
}) {
  const [photoAction, setPhotoAction] = useState<UnboxPhotoAction>('actions');
  const [linkageAction, setLinkageAction] = useState<UnboxLinkageAction>('actions');
  /** Photo Link handoff — PO item and/or carton aspect for Photos › Link. */
  const [photoLinkTarget, setPhotoLinkTarget] = useState<{
    lineId: number | null;
    cartonAspect: PhotoAspect | null;
    requestId: number;
  } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);

  // A different carton starts its drills at the actions lists.
  const cartonKey = row.receiving_id ?? row.id;
  useEffect(() => {
    setPhotoAction('actions');
    setLinkageAction('actions');
    setPhotoLinkTarget(null);
  }, [cartonKey]);
  useEffect(() => {
    setActionFeedback(null);
  }, [row.id]);

  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);

  const serialCount = Array.isArray(row.serials) ? row.serials.length : 0;
  const hasCarton = row.receiving_id != null;
  const gates = useMemo<UnboxSideTabGates>(
    () => ({
      hasLinkageTab: hasCarton && !returnOrderFound,
      hasInventoryTab: hasCarton,
      hasListingsTab: !c.isUnfound,
      hasUnits: serialCount > 0 || (row.quantity_expected ?? 0) > 0,
      hasPoNoteTab: !c.isUnfound && hasCarton,
      hasTrackingTab: !isLocalPickupFulfillment(row),
      hasTimelineTab: hasCarton,
    }),
    [hasCarton, returnOrderFound, c.isUnfound, serialCount, row],
  );

  const activeLeaf = displaysOpen ? resolveUnboxSideTab(activeDisplay, gates) : null;
  /** Look is hosted by the stack itself; pass it through so it paints, not the index. */
  const activeTab =
    activeLeaf ??
    (activeDisplay != null && isDisplaysHostedLeaf(activeDisplay)
      ? activeDisplay
      : STATION_DISPLAY_INDEX);

  /** Open a leaf; Photos / Pairing land on the given drill, else their actions list. */
  const openLeaf = useCallback(
    (tab: UnboxSideTab, nest?: UnboxLeafNest) => {
      if (tab === 'ticket') {
        selectTask('ticket');
        return;
      }
      if (tab === 'photos') setPhotoAction(nest?.photoAction ?? 'actions');
      if (tab === 'linkage') setLinkageAction(nest?.linkageAction ?? 'actions');
      openDisplay(tab);
    },
    [openDisplay, selectTask],
  );

  /** Leaf openers that toggle: a second press on the showing leaf closes the column. */
  const toggleLeaf = useCallback(
    (tab: UnboxSideTab) => {
      if (activeLeaf === tab) {
        closeDisplays();
        return;
      }
      openLeaf(tab);
    },
    [activeLeaf, closeDisplays, openLeaf],
  );

  /** Link / Change PO — the header Pair task; the Return order task once a return is found. */
  const openPairing = useCallback(() => {
    selectTask(returnOrderFound ? 'fulfilled' : 'pair');
  }, [returnOrderFound, selectTask]);

  const onFindTicket = useCallback(() => selectTask('ticket'), [selectTask]);
  const backToIndex = useCallback(() => openDisplay(STATION_DISPLAY_INDEX), [openDisplay]);
  const onPhotoActionChange = useCallback(
    (action: UnboxPhotoAction) => openLeaf('photos', { photoAction: action }),
    [openLeaf],
  );
  const onLinkageActionChange = useCallback(
    (action: UnboxLinkageAction) => openLeaf('linkage', { linkageAction: action }),
    [openLeaf],
  );

  // Item-photo dock Link → Photos › Link, defaulted to that line / aspect.
  useReceivingEvents({
    'receiving-open-photo-link': ({ lineId, cartonAspect }) => {
      setPhotoLinkTarget((prev) => ({
        lineId: lineId ?? null,
        cartonAspect: cartonAspect ?? null,
        requestId: (prev?.requestId ?? 0) + 1,
      }));
      openLeaf('photos', { photoAction: 'link' });
    },
  });

  const poNote = usePoNoteTabState({
    overallZohoNotes: row.receiving_zoho_notes ?? null,
    active:
      (activeLeaf === 'linkage' && linkageAction === 'note') || activeLeaf === 'inventory',
    onSaveOverallNote: saveOverallNote,
    // Full Inventory pull (mirror sync-one + carton inventory-sync) so PO header
    // notes land in receiving_carton.zoho_notes — not carton-only sync.
    onLoadZohoNotes: async () => {
      const result = await c.refreshInventoryDossier();
      return result.ok ? result.zohoNotes : null;
    },
    syncKey: cartonKey,
  });

  const tabs = useMemo(
    () =>
      displaysOpen
        ? buildUnboxSideTabs({
            row,
            staffId,
            c,
            activeSideTab: activeLeaf,
            gates,
            serialCount,
            poNote,
            photoAction,
            onPhotoActionChange,
            photoLinkTargetLineId: photoLinkTarget?.lineId ?? null,
            photoLinkTargetCartonAspect: photoLinkTarget?.cartonAspect ?? null,
            photoLinkTargetRequestId: photoLinkTarget?.requestId ?? 0,
            linkageAction,
            onLinkageActionChange,
            onOpenPairing: openPairing,
            onFindTicket,
            onInventorySync: () => c.refreshInventoryDossier(),
            onBackToIndex: backToIndex,
          })
        : [],
    [
      displaysOpen,
      row,
      staffId,
      c,
      activeLeaf,
      gates,
      serialCount,
      poNote,
      photoAction,
      onPhotoActionChange,
      photoLinkTarget,
      linkageAction,
      onLinkageActionChange,
      openPairing,
      onFindTicket,
      backToIndex,
    ],
  );

  const trackingPresent = String(row.tracking_number ?? '').trim().length > 0;
  const indexRows = useMemo(
    () =>
      buildUnboxDisplayIndexRows(gates, {
        hasTicketId: c.providerTicketId != null,
        photoCount: typeof row.photo_count === 'number' ? row.photo_count : null,
        serialCount,
        linkagePaired:
          Boolean(String(row.zoho_purchaseorder_id ?? '').trim()) ||
          Boolean(String(row.source_order_id ?? '').trim()),
        isUnfound: Boolean(c.isUnfound),
        trackingPresent,
        inventoryReceived:
          typeof row.quantity_received === 'number' ? row.quantity_received : null,
        inventoryExpected:
          typeof row.quantity_expected === 'number' ? row.quantity_expected : null,
      }),
    [
      gates,
      c.providerTicketId,
      c.isUnfound,
      row.photo_count,
      row.zoho_purchaseorder_id,
      row.source_order_id,
      row.quantity_received,
      row.quantity_expected,
      serialCount,
      trackingPresent,
    ],
  );

  /** Visit snapshot for Displays ← → — nest verbs ride with the leaf tab. */
  const visitFrame = useMemo((): DisplaysVisitFrame => {
    if (activeLeaf === 'photos') return { tab: activeTab, nest: { photoAction } };
    if (activeLeaf === 'linkage') return { tab: activeTab, nest: { linkageAction } };
    return { tab: activeTab };
  }, [activeLeaf, activeTab, photoAction, linkageAction]);

  const onVisitNavigate = useCallback(
    (frame: DisplaysVisitFrame) => {
      const tab = resolveUnboxSideTab(frame.tab, gates);
      if (tab == null) {
        openDisplay(STATION_DISPLAY_INDEX);
        return;
      }
      openLeaf(tab, {
        photoAction: parseUnboxPhotoAction(frame.nest?.photoAction),
        linkageAction: parseUnboxLinkageAction(frame.nest?.linkageAction),
      });
    },
    [gates, openDisplay, openLeaf],
  );

  const onTabChange = useCallback(
    (id: string) => {
      const tab = resolveUnboxSideTab(id, gates);
      if (tab == null) {
        openDisplay(id);
        return;
      }
      openLeaf(tab);
    },
    [gates, openDisplay, openLeaf],
  );

  const headerActions = (
    <CartonDisplaysActionFloor
      testIdPrefix="unbox"
      receivingId={row.receiving_id}
      isUnfound={Boolean(c.isUnfound)}
      onDeleted={closeDisplays}
      editSelected={activeLeaf === 'linkage'}
      deleteIdentity={{
        tracking: String(row.tracking_number ?? '').trim(),
        poNumber: row.zoho_purchaseorder_number,
      }}
      onEdit={() => {
        if (c.isUnfound || !gates.hasLinkageTab) {
          openPairing();
          return;
        }
        openLeaf('linkage');
      }}
      onLink={openPairing}
      print={{
        canPrint: c.canPrintReview,
        onPrint: () => {
          c.runPrintLabel();
          nudgeUnboxPrintReceive('print');
        },
      }}
      sync={{
        onInventorySync: () => c.refreshInventoryDossier(),
        inventorySyncing: Boolean(c.inventoryRefreshing),
        canInventorySync: hasCarton && Boolean((row.zoho_purchaseorder_id || '').trim()),
      }}
    />
  );

  const feedback = actionFeedback ? (
    <WorkspaceActionFeedbackSlot
      feedback={actionFeedback}
      onDismiss={() => setActionFeedback(null)}
    />
  ) : null;

  return {
    /** The leaf on screen (`null` on the index / closed). */
    activeLeaf,
    gates,
    openLeaf,
    toggleLeaf,
    /** PO-note save result — rides the workbench `feedback` slot. */
    feedback,
    stackProps: {
      tabs,
      activeTab,
      indexRows,
      visitFrame,
      onVisitNavigate,
      onTabChange,
      headerActions,
    },
  };
}
