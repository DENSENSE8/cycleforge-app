'use client';

/**
 * TriagePanel — the standalone right-pane editor for the **Receiving (Arrival /
 * triage)** mode: the fast "identify the carton before unbox" pass.
 *
 * Station column anatomy (Arrival port of the Unbox golden — see
 * `display/station-port-from-unbox.md`):
 *   - CENTRE is the door flow — identity ({@link StationContextBar}
 *     `placement="flow"`) → one white door-flow plane (`DISPLAYS_FLUSH_HOST` +
 *     `appSurfaceFillClass('chrome')`) holding PO / unfound **items** (no units
 *     chrome) → **Classify**. Identity abuts items with zero air
 *     (`reserveIdentityClearance={false}`, `bodyGap="none"`). No centre Staging
 *     card, no advisory strip, no Omnichannel notes float.
 *   - The bottom **dock** is Unbox flush geometry: dogfood strip =
 *     Save-for-unbox (`data-arrival-dogfood-terminal`); Band 1 =
 *     {@link ArrivalStagingDockControl} (shelf · lane ACTION); Band 2 =
 *     quiet "Staging" pager cell. Notes live on Unbox, not Arrival.
 *   - Ticket + Pairing/Linkage are the right-edge **Displays** push
 *     ({@link StationDisplaysPushStack} + {@link buildTriageDisplayTabs}),
 *     never a centre `SectionTabsSlider` strip. Ticket create/link/chat uses
 *     {@link TicketDisplayHost} (Unbox grain); Pairing hosts Store · PO.
 *   - {@link ScanStationUtilityRail} (slim white trailing chrome) carries the
 *     **carton cursor** (`↑` / `↓`) at the top and, when Displays is closed, the
 *     **`←|` Open displays** toggle in the **bottom** footer (left-dock twin).
 *     That control lands the Root Index (2+ displays) — never scrolls Classify /
 *     Staging (those keep their own centre / dock loci). Contextual opens
 *     (PO chip → Pairing, Find ticket → Ticket) skip the index. Not carton
 *     identity — a separate scan-station rail.
 *
 * The identity classify pills expand the centre Classify section; the `# ----`
 * PO chip opens the Linkage display and hands the PO avenue over as DATA
 * (`setPairingFocus` → the hub's `focusTab`), read on mount — never a timed
 * event (mirrors Unbox).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationPanelRoot,
  StationWorkbench,
  StationScanPaneHost,
  ScanStationCartonCursor,
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
import { UnboxDockHost } from '../workspace/line-edit/UnboxDockHost';
import type { ClaimModalMode } from '../workspace/claim/claim-types';
import {
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  useYieldStationDisplaysOnAssistantOpen,
} from '@/components/station/displays';
import { UnboxDisplaysUtilityRailBody } from '../workspace/UnboxDisplaysUtilityRailBody';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { markTriageCompleted, hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import { useTriageStaging } from './useTriageStaging';
import { ArrivalStagingDockControl } from './ArrivalStagingDockControl';
import { ArrivalDockScanEntry } from './ArrivalDockScanEntry';
import { ArrivalDisplaysActionFloor } from './ArrivalDisplaysActionFloor';
import { TriageClassifySection } from './TriageClassifySection';
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
  onPrevCarton,
  onNextCarton,
  prevCartonDisabled = false,
  nextCartonDisabled = false,
}: {
  row: ReceivingLineRow;
  staffId: string;
  onClose: () => void;
  /** Carton cursor — ↑ prev / ↓ next (same as left sidebar / DeskRailChromeRow). */
  onPrevCarton?: () => void;
  onNextCarton?: () => void;
  prevCartonDisabled?: boolean;
  nextCartonDisabled?: boolean;
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
  // Macro floor Edit); Classify stays in the centre; Staging lives in the flush dock.
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
      }),
    [
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

  const embeddedTerminal = (
    <StationTerminalDock
      embedded
      vm={terminalVm}
      className="h-full w-full min-w-0 shrink-0 self-stretch"
    />
  );

  // Scan-station chrome: utility rail when Displays closed (`←|` bottom
  // footer); ↑↓ on details panel top-right when open.
  const showCartonCursor = Boolean(onPrevCarton || onNextCarton);
  const utilityRailBody = !activeSideTab ? (
    <UnboxDisplaysUtilityRailBody
      onOpenDisplays={openDisplaysIndex}
      cartonCursor={
        showCartonCursor ? (
          <ScanStationCartonCursor
            onPrev={onPrevCarton}
            onNext={onNextCarton}
            prevDisabled={prevCartonDisabled}
            nextDisabled={nextCartonDisabled}
            orientation="vertical"
            prevTestId="arrival-carton-prev"
            nextTestId="arrival-carton-next"
            groupTestId="arrival-carton-cursor"
          />
        ) : null
      }
    />
  ) : null;

  const displaysCartonCursor = showCartonCursor ? (
    <ScanStationCartonCursor
      onPrev={onPrevCarton}
      onNext={onNextCarton}
      prevDisabled={prevCartonDisabled}
      nextDisabled={nextCartonDisabled}
      orientation="horizontal"
      size="sm"
      prevTestId="arrival-carton-prev"
      nextTestId="arrival-carton-next"
      groupTestId="arrival-carton-cursor"
    />
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
                // Flush dock + staging Band 1 needs pager clearance (Unbox SoT).
                reserveScrollClearance="pager"
                // Identity is in-flow (`StationContextBar placement="flow"`)
                // above this workbench — no guessed stacked pt clearance.
                reserveIdentityClearance={false}
                // Flat data floor — no vertical air between centre surfaces.
                bodyGap="none"
                // `tabs` is deliberately EMPTY: Pairing is Displays; Classify
                // stacks under items; Staging is the flush dock ACTION.
                feedback={
                  <WorkspaceActionFeedbackSlot
                    feedback={actionFeedback}
                    onDismiss={() => setActionFeedback(null)}
                  />
                }
                dock={
                  // Unbox flush floor — inset-x-0, safe-area only. Never a raised
                  // OmnichannelComposerDock / WorkspaceNotesCard float.
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-fab pb-[env(safe-area-inset-bottom,0px)] pt-0" // ds-allow-spacing: fixed-overlay safe-area geometry
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
                        <div
                          className="mb-0 flex h-11 w-full min-w-0 items-stretch border-t border-border-hairline bg-surface-card"
                          data-arrival-dogfood-terminal
                        >
                          <div
                            className="flex min-w-0 flex-1 items-stretch"
                            data-arrival-dock-terminal
                          >
                            {embeddedTerminal}
                          </div>
                        </div>
                      ) : null}
                      <UnboxDockHost
                        mode="entry"
                        onOpenNotes={() => {}}
                        onCloseNotes={() => {}}
                        hasItemNote={false}
                        showNotesToggle={false}
                        expandBand
                        omitTopSeam={Boolean(terminalVm)}
                        stepContext={
                          <div className="flex h-full min-w-0 flex-1 items-center inset-cozy">
                            <p className="truncate text-role-caption font-semibold text-text-muted">
                              Staging
                            </p>
                          </div>
                        }
                        leading={
                          <ArrivalStagingDockControl
                            staging={staging}
                            // Procedure locus: scan a shelf, place THIS carton.
                            // The sidebar bar stays ingest-only.
                            scanCell={
                              <ArrivalDockScanEntry
                                receivingId={row.receiving_id}
                                staging={staging}
                              />
                            }
                          />
                        }
                        trailing={null}
                        progress={<span className="sr-only">Door staging</span>}
                      />
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
                      // chrome (no condition · serial / Units). No "Open in
                      // unbox" — save for unbox from the dock. Suppress the
                      // "PO items · N" eyebrow — identity abuts the lines.
                      suppressItemsHeader
                      poItems
                      matching
                      openInUnbox={false}
                      editLines
                      serialScan={false}
                      unitsChrome={false}
                      c={c}
                    />
                    <div>
                      <TriageClassifySection
                        row={row}
                        c={c}
                        onFindTicket={openFindTicketDisplay}
                      />
                    </div>
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
              headerTrailing={displaysCartonCursor}
              actionFloor={
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
