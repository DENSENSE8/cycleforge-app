'use client';

/**
 * Right-pane workspace editor for a single receiving line — the UNBOX display,
 * and the MASTER/anchor for the workspace UX. All form state, effects, and
 * handlers live in `useUnboxLineController` (which composes the mode-agnostic
 * `useReceivingLineCore`); this file is pure composition — it lays out the
 * toolbar → scroll body → action bars from shared section components.
 *
 * Triage (the identify-before-unbox pass) is its own lean panel
 * ({@link TriagePanel}); the two no longer share a JSX shell or a capability
 * matrix. The testing display (/tech) composes the SAME core + cards with its
 * own controller, so the carton/identity logic lives in exactly one place.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  staggerRevealContainer,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { useReceivingTicketView } from './line-edit/hooks/useReceivingTicketView';
import { isReceivingInlineTicketEditorEnabled } from '@/lib/receiving/inline-ticket-editor-flag';
import { toast } from '@/lib/toast';
import { ReceiveFeedbackRegion } from './ReceiveFeedbackRegion';
import { WorkspaceActionFeedbackSlot } from './WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { WorkspaceNotesCard } from './line-edit/WorkspaceNotesCard';
import { LineLabelPreviewCard } from './line-edit/LineLabelPreviewCard';
import { LineReceiveActionBar } from './line-edit/LineReceiveActionBar';
import { LineEditToolbar } from './line-edit/LineEditToolbar';
import { ReceivingPhotoPeek } from './line-edit/ReceivingPhotoPeek';
import { LineCartonContextSection } from './line-edit/LineCartonContextSection';
import { POUnboxingSection } from './line-edit/POUnboxingSection';
import { LineChecklistTab } from './line-edit/LineChecklistTab';
import { LinePoNoteCard } from './line-edit/LinePoNoteCard';
import { useSyncedPoNote } from './line-edit/hooks/useSyncedPoNote';
import { CartonUnitsRollupBody } from './CartonUnitsRollup';
import { LineEditModals } from './line-edit/LineEditModals';
import { SectionTabsSlider, type SectionTab, WorkspaceCard } from '@/design-system/components';
import { Barcode, ClipboardList, FileText, MapPin, PackageOpen, Pencil, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { UnboxTrackingTab } from './line-edit/UnboxTrackingTab';
import { useUnboxLineController } from './line-edit/hooks/useUnboxLineController';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { useReturnOrderLinkage } from './line-edit/hooks/useReturnOrderLinkage';
import { useReceivingPhotoCount } from '@/hooks/useReceivingPhotoCount';
import { activeReceivingStepKey } from './ReceivingProgressStepper';

const LABEL_PRINTED_KEY = (lineId: number) => `receiving-label-printed:${lineId}`;

import { RECEIVING_WORKSPACE_COLUMN } from './receiving-workspace-layout';

type UnboxView = 'overview' | 'units' | 'checklist' | 'po-note' | 'tracking' | 'ticket';

function readLabelPrinted(lineId: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage.getItem(LABEL_PRINTED_KEY(lineId));
  } catch {
    return false;
  }
}

export function LineEditPanel({
  row,
  staffId,
  itemTotal,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Total number of items in the PO — drives the "Receive" vs "Receive all" labels. */
  itemTotal?: number;
}) {
  // All state, effects, and handlers live in the controller — this panel is pure
  // composition. See useUnboxLineController / useReceivingLineCore.
  const c = useUnboxLineController(row, staffId, { itemTotal });
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  // Shared PO-note save (overwrite + push to inventory) — used by the notes
  // composer's push button and the standalone "PO note" display tab.
  const { saveOverallNote } = useSyncedPoNote(row, setActionFeedback);
  // Print step reads the durable `label_printed_at` stamp (receiving_line_testing)
  // OR the localStorage optimistic hint — so the step survives a refresh / other
  // device, while still flipping instantly on print before the refetch lands.
  const [labelPrinted, setLabelPrinted] = useState(
    () => !!row.label_printed_at || readLabelPrinted(row.id),
  );

  useEffect(() => {
    setLabelPrinted(!!row.label_printed_at || readLabelPrinted(row.id));
  }, [row.id, row.label_printed_at]);

  useEffect(() => {
    const onLabel = (e: Event) => {
      const detail = (e as CustomEvent<{ line_id?: number }>).detail;
      if (detail?.line_id === row.id) setLabelPrinted(true);
    };
    window.addEventListener('receiving-label-printed', onLabel);
    return () => window.removeEventListener('receiving-label-printed', onLabel);
  }, [row.id]);

  // Live per-carton photo count (shared cache with the camera ×N badge), so the
  // active-step logic agrees with the stepper and doesn't regress to Photos when
  // a Condition update clobbers the denormalized `row.photo_count` snapshot.
  const photoCount = useReceivingPhotoCount(
    row.receiving_id,
    Math.max(0, Number(row.photo_count ?? 0)),
  );
  const rowSerials = Array.isArray(row.serials) ? row.serials : [];
  const serialCount = rowSerials.length;
  // Resolve the returned unit's OUTBOUND order (closed-loop linkage) from the
  // live scan input, falling back to the newest serial already on the line so
  // the identity persists after the scan bar clears. The resolved order# lands
  // in the top-row PO#/order chip (last-4) instead of a separate LINKAGE panel.
  const latestRowSerial = String(rowSerials[rowSerials.length - 1]?.serial_number ?? '').trim();
  const linkedOrder = useReturnOrderLinkage(c.serialInput.trim() || latestRowSerial);
  const activeStep = useMemo(
    () =>
      activeReceivingStepKey({
        photoCount,
        serialCount,
        serialAbsent: !!row.serial_absent,
        quantityExpected: row.quantity_expected ?? 0,
        labelPrinted,
      }),
    [photoCount, serialCount, row.serial_absent, row.quantity_expected, labelPrinted],
  );

  // The line detail (PO items + Notes + Label) is ONE display. The switcher only
  // appears once a second contextual display exists — the Units-on-carton rollup,
  // which becomes available as soon as a serial is scanned onto the carton. So an
  // un-serialled carton looks exactly like the plain stacked display (no bar).
  const [unboxView, setUnboxView] = useState<UnboxView>('overview');
  const hasUnits = serialCount > 0;
  // Tracking tab: only when the carton has a tracking# and a PO to key the
  // carrier lookup on (matched cartons); the timeline reuses the Incoming
  // shipment data + ShipmentTab, so nothing new is fetched or rendered.
  const trackingNumber = String(row.tracking_number ?? '').trim();
  const poIdForTracking = String(row.zoho_purchaseorder_id ?? '').trim();
  const hasTrackingTab = trackingNumber.length > 0 && poIdForTracking.length > 0;
  // Ticket tab: only when a support ticket is linked. Content is lazy-mounted
  // (only when active) so the Zendesk bundle isn't fetched on every carton.
  const linkedTicketId = c.providerTicketId;
  const hasTicketTab = linkedTicketId != null;
  // PO note tab: matched cartons only — an unfound carton has no PO to sync.
  const hasPoNoteTab = !c.isUnfound && row.receiving_id != null;
  const activeUnboxView: UnboxView =
    unboxView === 'checklist' ||
    (unboxView === 'po-note' && hasPoNoteTab) ||
    (unboxView === 'units' && hasUnits) ||
    (unboxView === 'tracking' && hasTrackingTab) ||
    (unboxView === 'ticket' && hasTicketTab)
      ? unboxView
      : 'overview';

  // Package Pairing state lifted here so its "Edit PO" pencil can live on the tab
  // row (context slot) instead of the removed "PO items · N" header.
  const [pairingOpen, setPairingOpen] = useState(false);
  const togglePairing = useCallback(() => setPairingOpen((v) => !v), []);
  // Match the tab pills exactly — same recessed track + pill, blue when active
  // (pairing open) — so the right pencil reads as a sibling of the left tabs.
  const editPoControl = (
    <div className="inline-flex items-center rounded-xl bg-surface-canvas p-1 ring-1 ring-inset ring-border-soft">
      <HoverTooltip
        label={pairingOpen ? 'Hide package pairing' : 'Show package pairing'}
        placement="below"
        focusable={false}
        asChild
      >
        {/* ds-raw-button: toggle pill styled identically to the SectionTabsSlider tab pills */}
        <button
          type="button"
          aria-label={pairingOpen ? 'Hide package pairing' : 'Show package pairing'}
          aria-expanded={pairingOpen}
          onClick={togglePairing}
          className={`flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
            pairingOpen
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
              : 'text-text-muted hover:text-text-default'
          }`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </HoverTooltip>
    </div>
  );

  useEffect(() => {
    setActionFeedback(null);
  }, [row.id]);

  const handleItemDescFeedback = useCallback((feedback: InlineActionFeedbackPayload | null) => {
    setActionFeedback(feedback);
  }, []);

  const handleItemDescSaved = useCallback(
    (lineId: number, zohoNotes: string | null) => {
      if (lineId === row.id) {
        dispatchLineUpdated({ id: row.id, zoho_notes: zohoNotes });
      }
    },
    [row.id],
  );

  const showReceiveFeedback = Boolean(c.receiving || c.receiveResult);

  // Staggered card "settle" — the panel remounts per carton (keyed in
  // ReceivingRightPane), so this cascade plays once per carton open: the cards
  // rise + fade in sequence over the pane's opacity cross-dissolve. Sibling-line
  // switches keep the same carton key (no remount), so they update in place
  // without re-cascading. Reduced-motion collapses it to a plain instant fade.
  const reduceMotion = useReducedMotion();
  const revealContainer = staggerRevealContainer(reduceMotion ? 0 : STAGGER_REVEAL_STEP);
  const revealItem: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.001 } } }
    : { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

  // Inline support-ticket editor (docs/todo/receiving-inline-ticket-editor-plan.md).
  // Flag-gated + opt-in; the body crossfades between the line-edit cards and the
  // reused SupportTicketDetail, keeping only the identity row. The rail (map)
  // never animates — only this focus-surface body swaps.
  const inlineTicketEditorEnabled = isReceivingInlineTicketEditorEnabled();
  const { ticketView, setTicketView } = useReceivingTicketView(row.id);
  const ticketId = c.providerTicketId;
  const showTicketEditor = inlineTicketEditorEnabled && ticketView && ticketId != null;
  const toggleTicketView = inlineTicketEditorEnabled
    ? () => setTicketView(!ticketView)
    : undefined;

  // Guardrail: the param is set but the linked ticket vanished (unlinked while
  // open, or a deep-link into a ticketless carton) → fall back to the normal
  // body and clear the URL so a stale ?ticketView=1 can't strand the pane.
  // Wait for the ticket lookup to SETTLE first (c.supportTicketLoading) so a
  // deep-link (?openReceivingId=&ticketView=1) doesn't self-close mid-fetch.
  useEffect(() => {
    if (
      ticketView &&
      inlineTicketEditorEnabled &&
      !c.supportTicketLoading &&
      ticketId == null
    ) {
      setTicketView(false);
      toast('No linked ticket to edit on this carton.');
    }
  }, [ticketView, inlineTicketEditorEnabled, c.supportTicketLoading, ticketId, setTicketView]);

  const paneTransition = useMotionTransition(framerTransition.workbenchPaneMount);
  const ticketPanePresence = useMotionPresence(framerPresence.workbenchPane);

  return (
    <>
      <div className="relative isolate flex h-full min-h-0 flex-col bg-surface-canvas">
        {/* Ambient wash — ultra-soft tonal blobs behind the glass cards so their
            backdrop-blur has something to frost. Sits at -z-10 inside the
            panel's isolated stacking context (`isolate` above), so it can never
            paint over content. Pure decoration: token-family hues at ≤8% alpha,
            calm enough to read as light, not color. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-blue-400/[0.08] blur-3xl" />
          <div className="absolute right-[-7rem] top-1/3 h-80 w-80 rounded-full bg-violet-400/[0.06] blur-3xl" />
          <div className="absolute bottom-[-5rem] left-[-5rem] h-80 w-80 rounded-full bg-emerald-400/[0.06] blur-3xl" />
        </div>
        {/* Toolbar is hidden in ticket view — SupportTicketDetail brings its
            own header (SupportChatHeader), so the "identity row only" editor
            stays focused. */}
        {!showTicketEditor ? (
          <LineEditToolbar
            mode="unbox"
            receivingId={row.receiving_id ?? null}
            zohoSyncing={c.zohoSyncing}
            busy={c.saving || c.platformSaving}
            copyingAll={c.copyingAll}
            handlers={{
              refresh: () => void c.syncWithZoho(),
              share: () => void c.handleShare(),
              audit: () => c.setAuditOpen(true),
              copy: () => void c.handleCopyAll(),
              photoNote: () => c.setPhotoNoteOpen(true),
            }}
          />
        ) : null}

        {/* Focus-surface swap: the line-edit body ⇄ the reused SupportTicketDetail,
            keyed on ticketView. The rail (collection map) never animates — only
            this body crossfades (Workbench focus-surface rule). */}
        <AnimatePresence mode="wait" initial={false}>
          {showTicketEditor ? (
            <motion.div
              key="ticket-editor"
              initial={ticketPanePresence.initial}
              animate={ticketPanePresence.animate}
              exit={ticketPanePresence.exit}
              transition={paneTransition}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Identity row stays — its reply-toggle (now active) is how the
                  operator swaps back. */}
              <div className="shrink-0 px-4 pt-5 sm:px-6">
                <div className={RECEIVING_WORKSPACE_COLUMN}>
                  <LineCartonContextSection
                    row={row}
                    staffId={staffId}
                    c={c}
                    linkedOrderNumber={linkedOrder?.orderId ?? null}
                    onToggleTicketView={toggleTicketView}
                    ticketViewActive
                  />
                </div>
              </div>
              {/* Reused support console — owns its own overlay host, scroll body,
                  and sticky composer. */}
              <div className="min-h-0 flex-1">
                {/* showTicketEditor guarantees ticketId != null. */}
                <SupportTicketDetail ticketId={ticketId!} onBack={() => setTicketView(false)} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="line-body"
              initial={ticketPanePresence.initial}
              animate={ticketPanePresence.animate}
              exit={ticketPanePresence.exit}
              transition={paneTransition}
              className="flex min-h-0 flex-1 flex-col"
            >
        {/* Scroll surface — owns the centered hero column. The receive-feedback,
            label-preview, and action bars now DOCK in flow below this region
            (shrink-0 bands), so the scroll body no longer reserves clearance for
            a floating pill — just a little breathing room above the first band. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <motion.div
            initial="hidden"
            animate="show"
            variants={revealContainer}
            className={`${RECEIVING_WORKSPACE_COLUMN} space-y-4 px-4 py-5 pb-6 sm:px-6`}
          >
            <motion.div variants={revealItem}>
              <LineCartonContextSection
                row={row}
                staffId={staffId}
                c={c}
                linkedOrderNumber={linkedOrder?.orderId ?? null}
                onToggleTicketView={toggleTicketView}
                ticketViewActive={false}
              />
            </motion.div>

            {/* One combined "Overview" display (PO items + Notes + Label) plus the
                Units-on-carton rollup that slides in as a second tab on serial
                scan. The slider owns the bar + content; with one tab it shows no
                bar and reads as the plain stacked display. */}
            <motion.div variants={revealItem}>
              <SectionTabsSlider
                value={unboxView}
                onChange={(id) => setUnboxView(id as UnboxView)}
                ariaLabel="Unbox displays"
                rightSlot={activeUnboxView === 'overview' ? editPoControl : undefined}
                tabs={[
                  {
                    id: 'overview',
                    label: 'Unbox',
                    icon: PackageOpen,
                    content: (
                      <div className="space-y-4">
                        {/* PO Items — accordion, auto-match strip (unfound only), Package Pairing.
                            Header row is suppressed; the tab row owns the Edit-PO pencil. */}
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
                          onPairingToggle={togglePairing}
                          onItemDescFeedback={handleItemDescFeedback}
                          onItemDescSaved={handleItemDescSaved}
                          activeStep={activeStep}
                        />
                        {/* Notes — operator Notes · read-only Zoho Notes · Checklist. */}
                        <WorkspaceNotesCard
                          row={row}
                          c={c}
                          onActionFeedback={setActionFeedback}
                          activeStep={activeStep}
                        />
                        {/* Label preview — you print at unbox. */}
                        <LineLabelPreviewCard
                          scanValue={c.scanValue}
                          labelPayload={c.labelPayload}
                          sku={row.sku}
                          itemName={row.item_name}
                          serialNumber={c.serialInput.trim()}
                          labelDraftDefaults={c.labelDraftDefaults}
                          buildLabelPayload={c.buildLabelPayload}
                          onApplyAndPrint={c.applyAndPrintLabel}
                        />
                      </div>
                    ),
                  },
                  ...(hasPoNoteTab
                    ? [
                        {
                          // Synced inventory (PO) note — carton-level, on the linked
                          // purchase order. Full view / reload / overwrite; matched
                          // cartons only. The composer's push button only APPENDS to it.
                          id: 'po-note',
                          label: 'Inventory notes',
                          icon: FileText,
                          content: (
                            <LinePoNoteCard
                              overallZohoNotes={row.receiving_zoho_notes ?? null}
                              active={activeUnboxView === 'po-note'}
                              onSaveOverallNote={saveOverallNote}
                              onLoadZohoNotes={() => c.syncCartonFromZoho()}
                            />
                          ),
                        } satisfies SectionTab,
                      ]
                    : []),
                  {
                    // Receiving checklist — a first-class carton display (peer of Unbox).
                    id: 'checklist',
                    label: 'Checklist',
                    icon: ClipboardList,
                    content: (
                      <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-4">
                        <LineChecklistTab lineId={row.id} sku={row.sku} />
                      </WorkspaceCard>
                    ),
                  } satisfies SectionTab,
                  ...(hasUnits
                    ? [
                        {
                          id: 'units',
                          label: `Units on carton · ${serialCount}`,
                          icon: Barcode,
                          content: (
                            <WorkspaceCard variant="glass" overflow="visible" bodyClassName="space-y-3 p-4">
                              <CartonUnitsRollupBody
                                receivingId={row.receiving_id ?? null}
                                activeLineId={row.id ?? null}
                                showEmpty
                              />
                            </WorkspaceCard>
                          ),
                        } satisfies SectionTab,
                      ]
                    : []),
                  ...(hasTrackingTab
                    ? [
                        {
                          id: 'tracking',
                          label: 'Tracking',
                          icon: MapPin,
                          content: <UnboxTrackingTab poId={poIdForTracking} />,
                        } satisfies SectionTab,
                      ]
                    : []),
                  ...(hasTicketTab
                    ? [
                        {
                          id: 'ticket',
                          label: 'Ticket',
                          icon: Ticket,
                          // Lazy-mount the support console only while the tab is
                          // active; it needs a bounded height for its own scroll +
                          // sticky composer. Reuses the integrated SupportTicketDetail.
                          content:
                            activeUnboxView === 'ticket' && linkedTicketId != null ? (
                              <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm">
                                <SupportTicketDetail ticketId={linkedTicketId} />
                              </div>
                            ) : null,
                        } satisfies SectionTab,
                      ]
                    : []),
                ]}
              />
            </motion.div>

            {/* Below label — item-desc / Zoho-notes saves (receive feedback docks above the bar). */}
            {!showReceiveFeedback ? (
              <WorkspaceActionFeedbackSlot
                feedback={actionFeedback}
                onDismiss={() => setActionFeedback(null)}
              />
            ) : null}
          </motion.div>
        </div>

        {showReceiveFeedback ? (
          // Transparent dock — no white backing strip. The feedback card is
          // self-contained (its own rounded green surface); it floats on the
          // canvas like the action bar below, not inside a full-bleed band.
          <div className="shrink-0 px-4 py-2 sm:px-6">
            <div className={RECEIVING_WORKSPACE_COLUMN}>
              <ReceiveFeedbackRegion
                receiving={c.receiving}
                receiveResult={c.receiveResult}
                responseExpanded={c.responseExpanded}
                setResponseExpanded={c.setResponseExpanded}
                onDismiss={() => {
                  c.setReceiveResult(null);
                  c.setResponseExpanded(false);
                }}
              />
            </div>
          </div>
        ) : null}

        <LineReceiveActionBar
          assignedTechId={row.assigned_tech_id}
          primaryLabel={c.printReceivePrimaryLabel}
          primaryTitle={c.printThenReceiveTitle}
          primaryDisabled={c.combinedReviewDisabled}
          disabledReason={c.combinedReviewDisabledReason}
          splitMenuAriaLabel={c.splitMenuAriaLabel}
          splitMenuHoverTitle={c.splitMenuHoverTitle}
          canPrint={c.canPrintReview}
          canReceive={c.canReceiveReview}
          canZohoReceive={c.canZohoReceive}
          isLocalReceive={c.isUnfound}
          receiveMenuLabel={c.receiveMenuLabel}
          receiveMenuTitle={c.receiveMenuTitle}
          maxWidthClass="max-w-[720px]"
          onPrintAndReceive={() => void c.handlePrintAndReceive()}
          onPrintOnly={() => c.runPrintLabel()}
          onMarkScanned={() => void c.handleReceive('scan_only')}
          onReceive={() => void c.handleReceive('zoho_receive')}
          onLocalReceive={() => void c.handleReceive('local_receive')}
        />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live photo peek — right-edge fanned preview of the carton's captures
            that updates in real time over Ably; needs a linked shipment for the
            photo query. Hidden in ticket view (the editor owns the full body). */}
        {!showTicketEditor && row.receiving_id != null ? (
          <ReceivingPhotoPeek
            receivingId={row.receiving_id}
            staffId={Number(staffId) || 0}
            poRef={c.poNumber || null}
            // Show every capture on the carton (matches the header photo-count
            // button). Scoping to `item` hid the peek for cartons whose only
            // shots are package/door photos (no unbox interior shots yet).
            photoIntent="all"
          />
        ) : null}
      </div>

      <LineEditModals row={row} c={c} />
    </>
  );
}
