'use client';

/**
 * TriagePanel — the standalone right-pane editor for the **Receiving (Arrival /
 * triage)** mode: the fast "identify the carton before unbox" pass.
 *
 * Station column anatomy (Arrival port of the Unbox golden — see
 * `display/station-port-from-unbox.md`):
 *   - CENTRE is the door flow and NOTHING else — identity
 *     ({@link StationContextBar} `placement="flow"`) → one white door-flow plane
 *     (`DISPLAYS_FLUSH_HOST` + `appSurfaceFillClass('chrome')`) holding PO /
 *     unfound **items** (no units chrome). Identity abuts items with zero air
 *     (`reserveIdentityClearance={false}`, `bodyGap="none"`). Nothing stacks
 *     under the items: the centre `TriageClassifySection` and the Staging
 *     control are both deleted (2026-08-20). **Classify is the identity
 *     header's pills and only those** — one surface for urgency · platform ·
 *     type, at the top, never a second copy in the middle. No advisory strip,
 *     no Omnichannel notes float.
 *   - **Staging is Displays-only.** Shelf + lane come from
 *     {@link ArrivalLocationsLeaf} on the right edge, whose `selectShelf`
 *     auto-routes the lane (`resolveTriageLane`) — so one placement satisfies
 *     BOTH fields `completeTriage` gates Save-for-unbox on. That gate is
 *     untouched; the control moved, the requirement did not.
 *   - The bottom **dock** is Unbox flush geometry: dogfood strip =
 *     Save-for-unbox (`data-arrival-dogfood-terminal`); Band 1 = ONE carton-note
 *     entry ({@link ArrivalCartonNotesEntry} → `receiving.support_notes`),
 *     mirroring the Unbox dock; Band 2 = quiet "Note" pager cell. No scan cell
 *     and no focus target here — the wedge stays the sidebar ingest bar's.
 *   - Ticket + Pairing/Linkage are the right-edge **Displays** push
 *     ({@link StationDisplaysPushStack} + {@link buildTriageDisplayTabs}),
 *     never a centre `SectionTabsSlider` strip. Ticket create/link/chat uses
 *     {@link TicketDisplayHost} (Unbox grain); Pairing hosts Store · PO.
 *   - {@link ScanStationUtilityRail} (slim white trailing chrome) carries the
 *     **carton cursor** (`↑` / `↓`) at the top and, when Displays is closed, the
 *     **`←|` Open displays** toggle in the **bottom** footer (left-dock twin).
 *     That control lands the Root Index (2+ displays). Contextual opens
 *     (PO chip → Pairing, Find ticket → Ticket) skip the index. Not carton
 *     identity — a separate scan-station rail.
 *
 * The `# ----`
 * PO chip opens the Linkage display and hands the PO avenue over as DATA
 * (`setPairingFocus` → the hub's `focusTab`), read on mount — never a timed
 * event (mirrors Unbox).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import {
  StationPanelRoot,
  StationWorkbench,
  StationScanPaneHost,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import { resolveTriageTerminal } from './terminal/triage-terminal';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import { WorkspaceActionFeedbackSlot } from '../workspace/WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from '../workspace/line-edit/ReceivingPhotoPeek';
import { LineEditModals } from '../workspace/line-edit/LineEditModals';
import { LineCartonContextSection } from '../workspace/line-edit/LineCartonContextSection';
import { POUnboxingSection } from '../workspace/line-edit/POUnboxingSection';
import type { ClaimModalMode } from '../workspace/claim/claim-types';
import {
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  useYieldStationDisplaysOnAssistantOpen,
} from '@/components/station/displays';
import { StationDisplaysUtilityRail } from '@/components/station/displays';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { markTriageCompleted, hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import { useTriageStaging } from './useTriageStaging';
import { ArrivalCartonNotesEntry } from './ArrivalCartonNotesEntry';
import { ArrivalDisplaysActionFloor } from './ArrivalDisplaysActionFloor';
import { deriveTriageFocusFacts, resolveTriageFocus } from '@/lib/receiving/triage-focus';
import { buildTriageDisplayTabs, type TriageDisplayTab } from './build-triage-displays';
import { buildTriageDisplayIndexRows } from './triage-display-index';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import {
  dispatchStationDeskOccupantClose,
  STATION_DISPLAYS_CLOSE_EVENT,
} from '@/utils/events';
import {
  DISPLAYS_FLUSH_HOST,
} from '@/design-system/shells/detail-stack';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';

export function TriagePanel({
  row,
  staffId,
  onClose,
}: {
  row: ReceivingLineRow;
  staffId: string;
  onClose: () => void;
}) {
  const staging = useTriageStaging(row);
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const queryClient = useQueryClient();
  const [savingTriage, setSavingTriage] = useState(false);
  const [triageSaved, setTriageSaved] = useState(false);

  // The right-edge Displays push (Ticket + Pairing). `null` IS closed; `index`
  // is Root Index; a leaf id is the open body. No second `pairingOpen` flag.
  const [activeSideTab, setActiveSideTab] = useState<
    TriageDisplayTab | typeof STATION_DISPLAY_INDEX | null
  >(null);
  const [claimMode, setClaimMode] = useState<ClaimModalMode>('link');
  const [pairingFocus, setPairingFocus] = useState<{
    tab: 'zoho_po' | null;
    requestId: number;
  } | null>(null);

  const claimDisplays = useCallback(
    (tab: TriageDisplayTab | typeof STATION_DISPLAY_INDEX) => {
      // One right-edge wrapper — Add inbound (RightRailHost) yields to Displays.
      dispatchStationDeskOccupantClose();
      setActiveSideTab(tab);
    },
    [],
  );
  const openDisplays = useCallback(
    (tab: TriageDisplayTab) => claimDisplays(tab),
    [claimDisplays],
  );
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);

  useEffect(() => {
    const onAddClaimsEdge = () => closeDisplays();
    window.addEventListener(STATION_DISPLAYS_CLOSE_EVENT, onAddClaimsEdge);
    return () => window.removeEventListener(STATION_DISPLAYS_CLOSE_EVENT, onAddClaimsEdge);
  }, [closeDisplays]);

  // Wire before the line controller so `c.openClaimModal` opens Ticket Displays
  // (Testing grain) instead of a no-op / modal.
  const onOpenClaim = useCallback(
    (mode: ClaimModalMode = 'create') => {
      setClaimMode(mode);
      openDisplays('ticket');
    },
    [openDisplays],
  );
  const c = useUnboxLineController(row, staffId, { onOpenClaim });
  const claimTicketId = c.providerTicketId ?? null;

  // The `# ----` PO chip → open Pairing on the PO avenue. The intent travels as
  // DATA (`pairingFocus` → the hub's `focusTab`, read on mount); a dispatched
  // event fires before the display's hub is listening (Unbox learned this).
  const openPoPairing = useCallback(() => {
    openDisplays('linkage');
    setPairingFocus((prev) => ({ tab: 'zoho_po', requestId: (prev?.requestId ?? 0) + 1 }));
  }, [openDisplays]);

  // `←|` Open displays → Root Index (Ticket + Pairing). Contextual leaf opens
  // (PO chip / Find ticket / identity ticket chip) skip the index.
  const openDisplaysIndex = useCallback(() => {
    claimDisplays(STATION_DISPLAY_INDEX);
  }, [claimDisplays]);

  const toggleTicketView = useCallback(() => {
    if (activeSideTab === 'ticket') closeDisplays();
    else openDisplays('ticket');
  }, [activeSideTab, closeDisplays, openDisplays]);

  const openClaimView = useCallback(() => {
    if (activeSideTab === 'ticket' && claimTicketId == null) closeDisplays();
    else onOpenClaim('create');
  }, [activeSideTab, claimTicketId, closeDisplays, onOpenClaim]);

  /**
   * The notes header's ⓘ → Displays → Timeline. Contextual detail opens on the
   * right edge, never as a dialog over the work the operator is doing.
   */
  const openTimelineDisplay = useCallback(() => {
    openDisplays('timeline');
  }, [openDisplays]);

  /** Auto-match Find ticket → Ticket display (link existing). */
  const openFindTicketDisplay = useCallback(() => {
    if (claimTicketId != null) openDisplays('ticket');
    else onOpenClaim('link');
  }, [claimTicketId, openDisplays, onOpenClaim]);

  const closeClaimView = useCallback(() => {
    c.setReturnClaimPrefill(null);
    if (claimTicketId != null) openDisplays('ticket');
    else openDisplaysIndex();
  }, [c, claimTicketId, openDisplays, openDisplaysIndex]);

  const onClaimTicketCreated = useCallback(
    (ticketNumber: string) => {
      toast.success(`Claim filed — ${ticketNumber}`);
      void c.invalidateSupportTicket();
      invalidateSupportContextCaches(queryClient);
      if (row.receiving_id != null) {
        patchReceivingRailTicketByCarton(queryClient, row.receiving_id, ticketNumber);
      }
      dispatchLineUpdated({ id: row.id, zendesk_ticket: ticketNumber, notes: row.notes });
      invalidateReceivingFeeds(queryClient);
      openDisplays('ticket');
    },
    [c, queryClient, row.id, row.notes, row.receiving_id, openDisplays],
  );

  const onClaimTicketUnlinked = useCallback(() => {
    void c.invalidateSupportTicket();
    invalidateSupportContextCaches(queryClient);
    if (row.receiving_id != null) {
      patchReceivingRailTicketByCarton(queryClient, row.receiving_id, null);
    }
    dispatchLineUpdated({ id: row.id, zendesk_ticket: null, notes: row.notes });
    invalidateReceivingFeeds(queryClient);
  }, [c, queryClient, row.id, row.notes, row.receiving_id]);

  useEffect(() => {
    setActionFeedback(null);
    setTriageSaved(false);
    setActiveSideTab(null);
    setClaimMode('link');
    c.setReturnClaimPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per carton open
  }, [row.id]);

  // On open, tell the operator when there is nothing left to do — the carton is
  // already staged. Displays open on demand (`←|` index / PO chip / Find ticket /
  // Macro floor Edit); Staging is the Locations display; Classify is the identity
  // header. The centre is items only.
  useEffect(() => {
    const facts = deriveTriageFocusFacts(
      row,
      row.triage_complete === true || hasTriageBeenCompleted(row.receiving_id),
    );
    if (resolveTriageFocus(facts) === 'already-staged') {
      toast.success('Already staged for unbox', {
        description: 'Nothing left to do here — open it in Unbox when ready.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per carton
  }, [row.id]);

  const handleSaveForUnbox = useCallback(async () => {
    if (row.receiving_id == null) {
      toast.error('This carton has no receiving id yet — try again after it resolves.');
      return;
    }
    setSavingTriage(true);
    try {
      const res = await fetch('/api/receiving/triage/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_id: row.receiving_id,
          client_event_id: safeRandomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not save for unbox');
        return;
      }
      markTriageCompleted(row.receiving_id);
      dispatchLineUpdated({ id: row.id, triage_complete: true });
      invalidateReceivingFeeds(queryClient);
      setTriageSaved(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      toast.error('Could not save for unbox');
    } finally {
      setSavingTriage(false);
    }
  }, [row.receiving_id, row.id, queryClient, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      if (savingTriage || triageSaved) return;
      e.preventDefault();
      void handleSaveForUnbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveForUnbox, savingTriage, triageSaved]);

  const triageDisplayTabs = useMemo(
    () =>
      buildTriageDisplayTabs({
        row,
        staffId,
        providerTicketId: claimTicketId,
        returnClaimPrefill: c.returnClaimPrefill ?? null,
        pairingFocus,
        claimMode,
        onCloseClaim: closeClaimView,
        onCloseTicket: openDisplaysIndex,
        onClaimTicketCreated,
        onClaimTicketUnlinked,
        onFindTicket: openFindTicketDisplay,
        // The New location leaf mints a shelf and places THIS carton on it,
        // through the same staging writer the dock and the <select> use.
        staging,
        onLocationPlaced: closeDisplays,
        // Root Index is not a leaf — Timeline's audit read waits for the leaf
        // itself, never paints behind the index.
        activeTab: activeSideTab === STATION_DISPLAY_INDEX ? null : activeSideTab,
      }),
    [
      activeSideTab,
      row,
      staffId,
      claimTicketId,
      c.returnClaimPrefill,
      pairingFocus,
      claimMode,
      closeClaimView,
      openDisplaysIndex,
      closeDisplays,
      onClaimTicketCreated,
      onClaimTicketUnlinked,
      openFindTicketDisplay,
      staging,
    ],
  );

  const triageDisplayIndexRows = useMemo(
    () =>
      buildTriageDisplayIndexRows(
        triageDisplayTabs.map((t) => t.id as TriageDisplayTab),
        {
          hasTicketId: claimTicketId != null,
          linkagePaired: Boolean(String(row.zoho_purchaseorder_id ?? '').trim()),
          isUnfound: shouldUseUnmatchedItemsSurface(row),
        },
      ),
    [triageDisplayTabs, claimTicketId, row],
  );

  const buildTerminal = useCallback(
    (kind: string) =>
      resolveTriageTerminal(kind, {
        triageSaved,
        savingTriage,
        onSaveForUnbox: handleSaveForUnbox,
      }),
    [triageSaved, savingTriage, handleSaveForUnbox],
  );

  // Terminal is carton-scoped (Save for unbox), never tab-scoped — a stable id
  // so opening a Displays tab never re-labels the dock (triage resolves every
  // kind to `mode-default`).
  const terminalVm = useStationTerminalAction({
    surface: 'triage',
    mode: 'triage',
    tabId: 'arrival',
    build: buildTerminal,
  });

  // The composer's bottom-right CTA — same shape Unbox mounts (`bubbleTerminal`
  // in LineEditPanel): an embedded pill on the notes card's trailing edge, never
  // a separate full-width terminal strip above the dock.
  const bubbleTerminal = terminalVm ? (
    <div className="shrink-0" data-arrival-dock-terminal>
      <StationTerminalDock embedded embeddedChrome="pill" vm={terminalVm} />
    </div>
  ) : null;

  // Scan-station chrome: utility rail when Displays closed (`←|` bottom
  // footer); ↑↓ on details panel top-right when open.
  const utilityRailBody = !activeSideTab ? (
    <StationDisplaysUtilityRail onOpenDisplays={openDisplaysIndex} />
  ) : null;

  return (
    <>
      <StationScanPaneHost
        displaysOpen={Boolean(activeSideTab)}
        hostDataAttrs={{ 'data-arrival-pane-host': true }}
        centerTestId="arrival-station-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              <StationContextBar
                placement="flow"
                identity={
                  <LineCartonContextSection
                    row={row}
                    staffId={staffId}
                    c={c}
                    expandClassifyWhenPending={false}
                    // Classify (urgency · platform · type) lives HERE, on the
                    // identity header, and nowhere else on this station. The
                    // stacked centre `TriageClassifySection` under the items is
                    // deleted — one classify surface, at the top, not two.
                    showClassifyControls
                    classifyInteractive
                    onEditPo={openPoPairing}
                    poEditOpen={activeSideTab === 'linkage'}
                    onToggleClaimView={openClaimView}
                    claimViewActive={activeSideTab === 'ticket' && claimTicketId == null}
                    onToggleTicketView={toggleTicketView}
                    ticketViewActive={activeSideTab === 'ticket'}
                    // Triage is the ARRIVAL pass — the one surface that owns this
                    // stage. Explicit so its correctness doesn't ride on a default.
                    photoStage="arrival_package"
                  />
                }
              />
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                // Same dock as Unbox now (raised notes card, no staging band),
                // so the same clearance: `pb-32`, not the `pb-56` pager reserve
                // the two-band flush floor needed.
                reserveScrollClearance
                // Identity is in-flow (`StationContextBar placement="flow"`)
                // above this workbench — no guessed stacked pt clearance.
                reserveIdentityClearance={false}
                // Flat data floor — no vertical air between centre surfaces.
                bodyGap="none"
                // `tabs` is deliberately EMPTY: Pairing and Locations are
                // Displays; Classify is the identity header; the centre is the
                // carton's items and nothing else.
                feedback={
                  <WorkspaceActionFeedbackSlot
                    feedback={actionFeedback}
                    onDismiss={() => setActionFeedback(null)}
                  />
                }
                dock={
                  // The Unbox floor, exactly: one raised WorkspaceNotesCard with
                  // the station terminal on its trailing edge. Same component,
                  // same geometry, same Enter-to-send grammar as
                  // `LineEditPanel` — Arrival differs only in the note's grain
                  // (carton) and the CTA's verb (Save for unbox).
                  <div
                    className={slicedActionDockWrapperClass({ docked: false })}
                    data-arrival-dock-float
                  >
                    <div className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}>
                      {terminalVm?.disabled && terminalVm.disabledReason ? (
                        <p
                          role="status"
                          className="mb-1 text-right text-role-caption font-semibold text-amber-700"
                        >
                          {terminalVm.disabledReason}
                        </p>
                      ) : null}
                      {terminalVm ? (
                        <ArrivalCartonNotesEntry
                          row={row}
                          trailingAction={bubbleTerminal}
                          onPrimaryAction={() => void handleSaveForUnbox()}
                          primaryActionDisabled={Boolean(terminalVm.disabled)}
                          onOpenStatusHistory={openTimelineDisplay}
                        />
                      ) : null}
                    </div>
                  </div>
                }
              >
                <div
                  className={cn(
                    DISPLAYS_FLUSH_HOST,
                    appSurfaceFillClass('chrome'),
                    'min-h-0 flex-1 overflow-y-auto',
                  )}
                  data-testid="arrival-door-flow"
                >
                  <div className="space-y-0">
                    <POUnboxingSection
                      row={row}
                      staffId={staffId}
                      // Door-flow items: matched → PoLinesAccordion; unfound →
                      // interactive UnmatchedAccordionSurface without units
                      // editors (no serial stamp / Units). Meta still paints
                      // Unbox five-track PoLineRow. No "Open in unbox" — save
                      // for unbox from the dock. Suppress the "PO items · N"
                      // eyebrow — identity abuts the lines.
                      suppressItemsHeader
                      poItems
                      matching
                      openInUnbox={false}
                      editLines
                      serialScan={false}
                      unitsChrome={false}
                      c={c}
                    />
                    {/* Nothing stacks under the items. Shelf + lane left the
                        centre 2026-08-20 for the Locations display
                        (ArrivalLocationsLeaf): its `selectShelf` auto-routes the
                        lane, so one placement still satisfies both fields
                        completeTriage gates Save-for-unbox on — the gate is
                        untouched, only its control moved. */}
                  </div>
                </div>
              </StationWorkbench>
            </div>

            {row.receiving_id != null ? (
              /* Triage is the ARRIVAL pass — the peek shows package (door) evidence
                 only; unbox carton/item shots belong to the unbox surfaces. */
              <ReceivingPhotoPeek
                receivingId={row.receiving_id}
                staffId={Number(staffId) || 0}
                poRef={row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || null}
                photoIntent="package"
              />
            ) : null}
          </StationPanelRoot>
        }
        displays={
          activeSideTab ? (
            <StationDisplaysPushStack
              ariaLabel="Arrival displays"
              storageKey="arrival-displays-push-width"
              testId="arrival-displays-push"
              resizeTestId="arrival-displays-push-resize"
              tabs={triageDisplayTabs}
              indexRows={triageDisplayIndexRows}
              activeTab={activeSideTab}
              onTabChange={(id) => {
                if (id === STATION_DISPLAY_INDEX) {
                  claimDisplays(STATION_DISPLAY_INDEX);
                  return;
                }
                claimDisplays(id as TriageDisplayTab);
              }}
              onClose={closeDisplays}
              headerActions={
                <ArrivalDisplaysActionFloor
                  receivingId={row.receiving_id}
                  isUnfound={shouldUseUnmatchedItemsSurface(row)}
                  openDisplays={openDisplays}
                  onDeleted={closeDisplays}
                  editSelected={activeSideTab === 'linkage'}
                  deleteIdentity={{
                    tracking: row.tracking_number,
                    poNumber: row.zoho_purchaseorder_number,
                  }}
                  onInventorySync={() => c.refreshInventoryDossier()}
                  inventorySyncing={Boolean(c.inventoryRefreshing)}
                  canInventorySync={
                    row.receiving_id != null &&
                    Boolean((row.zoho_purchaseorder_id || '').trim())
                  }
                />
              }
            />
          ) : null
        }
      />

      <LineEditModals row={row} c={c} />
    </>
  );
}
