'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dispatchLineUpdated } from '@/components/station/ReceivingLinesTable';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import { deferInvalidateReceivingFeeds, patchUnboxRailQtyByCarton } from '@/lib/queries/receiving-queries';
import { randomId } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { classifyReceiveResponse } from '../../ReceiveResponsePanel';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import { enqueuePendingZohoSync } from '@/lib/receiving/zoho-sync-toast-tracker';
import { useAuth } from '@/contexts/AuthContext';

// 'local_receive' = unfound carton: mark RECEIVED locally, never touch Zoho.
// Distinct from 'scan_only', which stays SCANNED.
type ReceiveIntent = 'zoho_receive' | 'scan_only' | 'local_receive';

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
  | { kind: 'diagnostic'; response: ReceiveResponseRecord };

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

  const handleReceive = useCallback(
    (receiveIntent: ReceiveIntent = 'zoho_receive') => {
      if (receiveInFlightRef.current) return;
      if (row.receiving_id == null) {
        // Pre-condition failure surfaces inline (no toast) so every receive
        // signal lives in the same place below the label.
        setReceiveResult({
          kind: 'diagnostic',
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
        return;
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

      // Fire-and-forget — operator keeps working while the local commit + Zoho
      // sync settle. The print popup was opened synchronously by the caller
      // (runPrintLabel) before we got here, so no await blocks it.
      //
      // NOTE: the former /api/zoho/health circuit pre-check (up to 3s on EVERY
      // receive) is gone. The server now reads its own in-process breaker and
      // returns skip_reason 'zoho_circuit_open' inline, so a cooldown surfaces
      // with zero added latency on the happy path.
      void (async () => {
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
            setReceiveResult({ kind: 'diagnostic', response: respRecord });
            setResponseExpanded(true);
            playScanFeedback('reject');
          } else {
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
              // #region agent log
              if (rid === 14221 || row.zoho_purchaseorder_number === '63931720') {
                fetch('http://127.0.0.1:7336/ingest/8bd437e7-bc3e-4c78-9dcf-4ca4496a96b4', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1348cc' },
                  body: JSON.stringify({
                    sessionId: '1348cc',
                    runId: 'pre-fix',
                    hypothesisId: 'B',
                    location: 'useReceiveAction.tsx:optimistic-patch',
                    message: 'Mark-received optimistic Unboxed rail patch',
                    data: {
                      rid,
                      lineId: src.id,
                      workflow_status: src.workflow_status ?? null,
                      qty_r: src.quantity_received,
                      qty_e: src.quantity_expected,
                      httpOk: respRecord.ok,
                      po: row.zoho_purchaseorder_number,
                    },
                    timestamp: Date.now(),
                  }),
                }).catch(() => {});
              }
              // #endregion
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
            } else {
              setReceiveResult({ kind: 'diagnostic', response: respRecord });
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
          window.dispatchEvent(new CustomEvent('app-refresh-data'));

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
      })();
    },
    [
      row.receiving_id,
      row.id,
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
