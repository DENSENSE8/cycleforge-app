'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import { deferInvalidateReceivingFeeds, patchUnboxRailQtyByCarton } from '@/lib/queries/receiving-queries';
import { randomId } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { classifyReceiveResponse } from '../../ReceiveResponsePanel';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { pulseScanLine } from '@/lib/scan-feedback/visual';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import {
  photoPolicyOverrideField,
  readPhotoPolicyWaiver,
  type PhotoPolicyWaiver,
} from '@/lib/receiving/photo-policy-override-wire';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';
import { enqueuePendingZohoSync } from '@/lib/receiving/zoho-sync-toast-tracker';
import { useAuth } from '@/contexts/AuthContext';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

// 'local_receive' = unfound carton: mark RECEIVED locally, never touch Zoho.
// 'unreceive' = full undo of website Receive (qty + stamp + Zoho reverse).
// Distinct from 'scan_only', which stays SCANNED without clearing qty/stamp.
type ReceiveIntent = 'zoho_receive' | 'scan_only' | 'local_receive' | 'unreceive';

/**
 * Last response from POST /api/receiving/mark-received-po. Surfaced inline
 * below the label (ReceiveResponsePanel for non-success) so operators can see
 * exactly why a Zoho receive succeeded, was skipped (missing zoho ids), or
 * failed (rate_limit, circuit_open, api, other). No more silent failures —
 * and no more bottom-right toasts.
 */
export type ReceiveResponseRecord = {
  at: number;
  /** ms wall-clock from POST → response */
  durationMs: number;
  httpStatus: number;
  ok: boolean;
  /** Raw JSON body returned from the API. */
  body: unknown;
  /** Network-level error message (thrown before/after the fetch). */
  networkError?: string;
};

/**
 * The per-action breakdown the inline ReceiveSuccessChecklist renders as
 * staggered green checks. Optimistic — the Zoho writes run server-side in
 * after(); the realtime `zohoReceive` verdict reconciles a background failure.
 */
export type ReceiveSummary = {
  /** Zoho purchase receive was attempted against a linked PO. */
  markedReceived: boolean;
  /** Lines whose description got the `SN: …` + condition write. */
  descriptionsUpdated: number;
  /** A notes string was pushed to the Zoho PO. */
  notesUpdated: boolean;
  /** Nothing reached Zoho — local-only (unfound / no PO link / scan-only). */
  localOnly: boolean;
  /** Drives headline wording. */
  intent: ReceiveIntent;
  /** Unfound carton — "Received locally", label printed, Zoho untouched. */
  isUnfound: boolean;
  /** Zoho was already fully received — local now matches the dashboard. */
  alreadyReceived: boolean;
  /** Per-line Zoho item description for the details dropdown. */
  itemDescription?: string | null;
  /** PO / operator notes text for the details dropdown. */
  poNotes?: string | null;
  /**
   * Set when the receive went through on a photo-policy waiver. The checklist
   * turns amber and names the reason — a receive that skipped the evidence gate
   * must not paint the same green as one that satisfied it.
   */
  photoPolicyWaiver: PhotoPolicyWaiver | null;
};

/**
 * The inline receive feedback shown below the label. Replaces the old
 * bottom-right toast entirely:
 *   - `success`    → animated ReceiveSuccessChecklist (green checks)
 *   - `diagnostic` → the existing ReceiveResponsePanel (skip / cooldown / error)
 */
export type ReceiveResult =
  | {
      kind: 'success';
      at: number;
      summary: ReceiveSummary;
      receivingId: number;
      /** receiving_line ids touched — used to match the realtime reconcile. */
      lineIds: number[];
      /** Watch the realtime `zohoReceive` verdict to confirm/flip on failure. */
      reconcile: boolean;
      /** Raw API response — surfaced in the success card's details dropdown. */
      response: ReceiveResponseRecord;
    }
  | {
      kind: 'diagnostic';
      response: ReceiveResponseRecord;
      /**
       * Intent this attempt used. Carried so a photo-policy override can replay
       * the SAME receive rather than guessing `zoho_receive` — waiving the gate
       * must never silently upgrade a scan-only or local receive.
       */
      intent: ReceiveIntent;
    };

export type ReceiveInFlight = { startedAt: number; intent: ReceiveIntent };

/**
 * The Receive / Mark-as-scanned action for a single line. Runs as a
 * fire-and-forget background task (the local commit returns in a few seconds;
 * Zoho is synced server-side in after()) — the button does NOT visually lock; a
 * ref guards against double-clicks. All feedback is inline below the label:
 * `receiving` drives a compact progress strip, `receiveResult` the success
 * checklist or the diagnostic panel.
 */
export function useReceiveAction(
  row: ReceivingLineRow,
  {
    qa,
    disp,
    cond,
    notes,
    zendesk,
    listingLink,
    serialInput,
    serialAbsent,
    serialAbsentReason,
    staffId,
  }: {
    qa: string;
    disp: string;
    cond: string;
    notes: string;
    zendesk: string;
    listingLink: string;
    serialInput: string;
    serialAbsent: boolean;
    serialAbsentReason: string | null;
    staffId: string;
  },
) {
  const queryClient = useQueryClient();
  const receiveInFlightRef = useRef(false);
  const [receiving, setReceiving] = useState<ReceiveInFlight | null>(null);
  const [receiveResult, setReceiveResult] = useState<ReceiveResult | null>(null);
  const { user } = useAuth();
  const orgId = user?.organizationId ?? null;
  // Kept only for the diagnostic panel's raw-response expander.
  const [responseExpanded, setResponseExpanded] = useState(false);

  // Unfound, return, and sales-order-linked cartons receive locally — never Zoho.
  const isUnfound = shouldUseLocalReceiveOnly(row);
  // Multimodal confirmation cue (gated by org master switch + per-staff toggles).
  const { playScanFeedback } = useScanFeedback();

  /**
   * `options.photoPolicyOverride` waives the receive-time photo-evidence gate.
   * It is only ever supplied by the surface that just made the operator pick a
   * reason (`PhotoPolicyOverrideSheet`); omitting it leaves the gate a hard
   * block, which is the safe default and why it has no default value here.
   */
  const handleReceive = useCallback(
    (
      receiveIntent: ReceiveIntent = 'zoho_receive',
      options?: { photoPolicyOverride: PhotoPolicyOverrideCode },
    ): Promise<boolean> => {
      const photoPolicyOverride = options?.photoPolicyOverride ?? null;
      if (receiveInFlightRef.current) return Promise.resolve(false);
      if (row.receiving_id == null) {
        // Pre-condition failure surfaces inline (no toast) so every receive
        // signal lives in the same place below the label.
        setReceiveResult({
          kind: 'diagnostic',
          intent: receiveIntent,
          response: {
            at: Date.now(),
            durationMs: 0,
            httpStatus: 0,
            ok: false,
            body: {
              error:
                'Cannot receive — link this item to a shipment first. Scan tracking or use lookup so this line has a receiving (package) id.',
            },
          },
        });
        setResponseExpanded(false);
        return Promise.resolve(false);
      }
      // Unfound dock walk: never stamp empty local_receive (unfound_no_po) —
      // identify/create the unmatched line first (contents step / classify).
      if (receiveIntent === 'local_receive' && row.id <= 0) {
        setReceiveResult({
          kind: 'diagnostic',
          intent: receiveIntent,
          response: {
            at: Date.now(),
            durationMs: 0,
            httpStatus: 0,
            ok: false,
            body: {
              error:
                'Identify the item first — add an unmatched line (contents step) before receiving into inventory.',
            },
          },
        });
        setResponseExpanded(false);
        return Promise.resolve(false);
      }
      // Commit order: print → stage → receive. Block inventory commit until the
      // operator has scanned a putaway location (after print). Unreceive skips.
      if (
        receiveIntent !== 'unreceive' &&
        Boolean(row.label_printed_at) &&
        !(row.staged_at && row.staged_location_id)
      ) {
        setReceiveResult({
          kind: 'diagnostic',
          intent: receiveIntent,
          response: {
            at: Date.now(),
            durationMs: 0,
            httpStatus: 0,
            ok: false,
            body: {
              error:
                'Scan a location barcode first — stage this unit before receiving into inventory.',
            },
          },
        });
        setResponseExpanded(false);
        return Promise.resolve(false);
      }

      receiveInFlightRef.current = true;
      const startedAt = Date.now();
      setReceiving({ startedAt, intent: receiveIntent });
      // Clear the prior result while a fresh receive is in flight so the
      // progress strip isn't competing with a stale checklist.
      setReceiveResult(null);
      setResponseExpanded(false);

      // Stable per-click id used as both the Idempotency-Key header and the
      // body's client_event_id so api_idempotency_responses replays the cached
      // response on retry / double-click instead of re-running the receive flow
      // (which would double-call Zoho).
      const clientEventId = randomId();

      // Returns a promise so Inventory Displays (and other awaiters) can refresh
      // the dossier after push. Dock print+receive still fires without await —
      // the print popup was opened synchronously by the caller (runPrintLabel).
      //
      // NOTE: the former /api/zoho/health circuit pre-check (up to 3s on EVERY
      // receive) is gone. The server now reads its own in-process breaker and
      // returns skip_reason 'zoho_circuit_open' inline, so a cooldown surfaces
      // with zero added latency on the happy path.
      return (async () => {
        let succeeded = false;
        try {
          const perLineNotes = notes.trim() || null;

          const markRes = await fetch('/api/receiving/mark-received-po', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': clientEventId,
            },
            body: JSON.stringify({
              receiving_id: row.receiving_id,
              receiving_line_id: row.id,
              receive_intent: receiveIntent,
              qa_status: qa,
              disposition_code: disp,
              condition_grade: cond,
              serial_number: serialInput.trim() || undefined,
              serial_absent: serialAbsent || undefined,
              serial_absent_reason: serialAbsent ? serialAbsentReason || undefined : undefined,
              zendesk_ticket: zendesk.trim() || undefined,
              listing_link: listingLink.trim() || undefined,
              notes: perLineNotes || undefined,
              staff_id: Number(staffId),
              client_event_id: clientEventId,
              ...(photoPolicyOverride ? photoPolicyOverrideField(photoPolicyOverride) : null),
            }),
            // Hard ceiling so a server-side hang can never wedge the progress
            // strip. The handler returns optimistically within a few seconds;
            // anything past 30s is a real failure and the operator should retry
            // — the same Idempotency-Key replays the cached response if the
            // server actually did complete.
            signal: AbortSignal.timeout(30_000),
          });
          const markData = await markRes.json().catch(() => null);

          const respRecord: ReceiveResponseRecord = {
            at: Date.now(),
            durationMs: Date.now() - startedAt,
            httpStatus: markRes.status,
            ok: markRes.ok && Boolean(markData?.success),
            body: markData,
          };

          if (!respRecord.ok) {
            console.error('receiving/mark-received-po failed', {
              status: markRes.status,
              error: (markData as { error?: unknown })?.error,
            });
            setReceiveResult({ kind: 'diagnostic', intent: receiveIntent, response: respRecord });
            setResponseExpanded(true);
            playScanFeedback('reject');
          } else {
            succeeded = true;
            // Prefer the Unbox `stage` bin over silent default putaway
            // (`putaway-placement` / UNSORTED). Fire-and-forget after inventory
            // commit — putaway requires `receiving.bin_assign`; stage stamp alone
            // used `mark_received`.
            const stagedBinId = Number(row.staged_location_id);
            if (
              receiveIntent !== 'unreceive' &&
              Number.isFinite(stagedBinId) &&
              stagedBinId > 0 &&
              row.id > 0
            ) {
              void fetch(`/api/receiving/lines/${row.id}/putaway`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bin_id: stagedBinId,
                  station: 'RECEIVING',
                  notes: 'Unbox staged location',
                }),
              }).catch(() => {
                /* non-fatal — inventory already committed; stock desk can relocate */
              });
            }
            // Optimistic workspace + Unboxed dock: POST already carries updated
            // qty/workflow. Narrow bus patches update accordion/selection;
            // Unboxed is opted off that bus — allowlisted carton qty helper
            // flips the dock within a frame. Segment membership (Queue→Unboxed)
            // reconciles on the deferred invalidate below.
            const receivedRows = Array.isArray(markData?.receiving_lines)
              ? (markData.receiving_lines as Array<Partial<ReceivingLineRow> & { id?: unknown }>)
              : [];
            const linesByCarton = new Map<number, Array<Partial<ReceivingLineRow> & { id: number }>>();
            for (const r of receivedRows) {
              if (typeof r?.id !== 'number' || r.id <= 0) continue;
              // Workspace/accordion only — never dump full hydrate onto the bus.
              dispatchUnboxRailLineUpdated({
                id: r.id,
                workflow_status: r.workflow_status,
                quantity_received: r.quantity_received,
                quantity_expected: r.quantity_expected,
                qa_status: r.qa_status,
                disposition_code: r.disposition_code,
                // Unreceive clears the sticky DONE stamp so the dock flips
                // primary back to print-then-receive without waiting on refetch.
                ...(receiveIntent === 'unreceive' ? { received_done_at: null } : {}),
              });
              const rid = r.receiving_id;
              if (typeof rid === 'number' && Number.isFinite(rid) && rid > 0) {
                const list = linesByCarton.get(rid) ?? [];
                list.push(r as Partial<ReceivingLineRow> & { id: number });
                linesByCarton.set(rid, list);
              }
            }
            for (const [rid, lines] of linesByCarton) {
              // Prefer the workspace line being received, else first marked line.
              const src = lines.find((l) => l.id === row.id) ?? lines[0];
              if (!src) continue;
              patchUnboxRailQtyByCarton(queryClient, rid, {
                quantity_received:
                  typeof src.quantity_received === 'number' ? src.quantity_received : undefined,
                quantity_expected: src.quantity_expected,
                workflow_status: src.workflow_status ?? null,
              });
            }

            // Reuse the panel's verdict taxonomy: emerald = a genuine success
            // (received / scanned / already-received) → animated checklist;
            // amber/rose (no-PO-link, cooldown, rate-limit, api error) → the
            // detailed diagnostic panel.
            const classification = classifyReceiveResponse(respRecord);
            if (classification.tone === 'emerald') {
              const serverSummary = (markData?.summary || {}) as Partial<{
                marked_received: boolean;
                descriptions_updated: number;
                notes_updated: boolean;
                local_only: boolean;
              }>;
              const zoho = (markData?.zoho || {}) as {
                attempted?: number;
                skip_reason?: string | null;
              };
              const attempted = Number(zoho.attempted ?? 0);
              const alreadyReceived = zoho.skip_reason === 'zoho_already_fully_received';
              const lineIds = Array.isArray(markData?.receiving_lines)
                ? (markData.receiving_lines as Array<{ id?: unknown }>)
                    .map((r) => Number(r?.id))
                    .filter((n) => Number.isFinite(n) && n > 0)
                : [];

              const summary: ReceiveSummary = {
                markedReceived:
                  serverSummary.marked_received ??
                  (receiveIntent === 'zoho_receive' && attempted > 0),
                descriptionsUpdated:
                  serverSummary.descriptions_updated ??
                  (receiveIntent === 'zoho_receive' && attempted > 0 && serialInput.trim() ? 1 : 0),
                notesUpdated:
                  serverSummary.notes_updated ??
                  Boolean(perLineNotes && attempted > 0 && receiveIntent === 'zoho_receive'),
                localOnly: serverSummary.local_only ?? attempted === 0,
                intent: receiveIntent,
                isUnfound,
                alreadyReceived,
                itemDescription: row.zoho_notes?.trim() || null,
                poNotes: perLineNotes || row.receiving_zoho_notes?.trim() || null,
                // Read off the RESPONSE, never off what we sent: the server is
                // the authority on whether the gate actually had to be waived,
                // and a carton whose photos landed mid-flight comes back clean.
                photoPolicyWaiver: readPhotoPolicyWaiver(markData),
              };

              setReceiveResult({
                kind: 'success',
                at: respRecord.at,
                summary,
                receivingId: row.receiving_id!,
                lineIds,
                reconcile: receiveIntent === 'zoho_receive' && attempted > 0 && !alreadyReceived,
                response: respRecord,
              });

              const reconcile =
                receiveIntent === 'zoho_receive' && attempted > 0 && !alreadyReceived;
              if (reconcile && orgId) {
                enqueuePendingZohoSync({
                  id: `zoho-sync:${orgId}:${clientEventId}`,
                  orgId,
                  lineIds,
                  createdAt: respRecord.at,
                  label: 'Syncing to inventory…',
                });
              }
              playScanFeedback('success');
              pulseScanLine(row.id);
            } else {
              setReceiveResult({ kind: 'diagnostic', intent: receiveIntent, response: respRecord });
              setResponseExpanded(true);
              playScanFeedback('reject');
            }
          }

          // Reconcile every receiving feed — but DEFER it to idle now that the
          // optimistic dispatch above already flipped the visible row. This
          // moves the heavy 5-root refetch stampede off the critical path so
          // the receive reads as instant; it still reconciles the rail SEGMENT
          // move + tile counts a beat later. `app-refresh-data` stays for the
          // non-receiving listeners that also key off the global signal.
          deferInvalidateReceivingFeeds(queryClient);
          refreshDomains(REFRESH_BUNDLES.receivingWrite);

          // Fire-and-forget workspace reconcile. Prefer narrow patches — a full
          // by-id/by-carton GET row must not ride `receiving-line-updated` onto
          // mode docks (Unboxed / Testing opted out; Triage still listens).
          // Deferred invalidate + realtime channel cover dock membership.
          if (markRes.ok) {
            void (async () => {
              try {
                const linesRes = await fetch(
                  `/api/receiving-lines?receiving_id=${row.receiving_id}&include=serials`,
                  { signal: AbortSignal.timeout(15_000) },
                );
                const lineData = await linesRes.json();
                const rows = Array.isArray(lineData?.receiving_lines) ? lineData.receiving_lines : [];
                for (const r of rows) {
                  if (typeof r?.id !== 'number' || r.id <= 0) continue;
                  const line = r as ReceivingLineRow;
                  dispatchLineUpdated({
                    id: line.id,
                    serials: line.serials ?? [],
                    workflow_status: line.workflow_status,
                    quantity_received: line.quantity_received,
                    quantity_expected: line.quantity_expected,
                    qa_status: line.qa_status,
                    disposition_code: line.disposition_code,
                  });
                }
              } catch {
                /* table may still reflect partial state — realtime channel reconciles */
              }
            })();
          }
        } catch (err) {
          console.error('receiving/mark-received-po threw', err);
          const message = err instanceof Error ? err.message : 'Receive failed';
          setReceiveResult({
            kind: 'diagnostic',
            intent: receiveIntent,
            response: {
              at: Date.now(),
              durationMs: Date.now() - startedAt,
              httpStatus: 0,
              ok: false,
              body: null,
              networkError: message,
            },
          });
          setResponseExpanded(true);
          playScanFeedback('reject');
        } finally {
          receiveInFlightRef.current = false;
          setReceiving(null);
        }
        return succeeded;
      })();
    },
    [
      row.receiving_id,
      row.id,
      row.label_printed_at,
      row.staged_at,
      row.staged_location_id,
      orgId,
      isUnfound,
      qa,
      disp,
      cond,
      notes,
      zendesk,
      listingLink,
      serialInput,
      serialAbsent,
      serialAbsentReason,
      staffId,
      queryClient,
      playScanFeedback,
    ],
  );

  return {
    receiving,
    receiveResult,
    setReceiveResult,
    responseExpanded,
    setResponseExpanded,
    handleReceive,
  };
}
