/**
 * Receiving scan — the effectful APPLY layer.
 *
 * Once a rung resolves (see the pure pipeline in `src/lib/receiving/scan`), these
 * two functions perform every side-effect needed to OPEN the carton: PO context,
 * row hydration, optimistic select, rail upsert (replacing the pending `scan:`
 * stub), and phone-camera nudge. Live Zoho promote is operator/cron only.
 */

import {
  deferInvalidateTriageAndUnboxQueueFeeds,
  deferInvalidateTriageReceivingFeeds,
  dispatchReceivingLinesPrepended,
  dispatchReceivingTriageRefresh,
  receivingSiblingsQueryKey,
  removePendingScanRailRow,
  seedReceivingSiblingsCache,
  upsertReceivingRailRows,
  upsertUnboxQueueRows,
  receivingRailCartonKey,
} from '@/lib/queries/receiving-queries';
import type { LookupPoData } from '@/lib/receiving/scan';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  buildMatchedStubRow,
  buildUnmatchedStubRow,
  buildUnboxRailUnmatchedRow,
  mapApiLineToPoSummary,
  parseReceivingPackage,
  pendingScanReconcileKey,
  type PoContext,
  type PoLineSummary,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { filterLinesByPoGroup } from '@/lib/receiving/po-group-title';
import type { ScanApplyCtx } from './scan-types';

/** After a scan opens a carton: unbox arms the serial field; triage keeps the tracking scan bar hot. */
export function refocusScanInput(
  ctx: Pick<ScanApplyCtx, 'intakeSurface' | 'autoFocusSerialRef' | 'serialInputRef'>,
): void {
  if (ctx.intakeSurface === 'unbox') {
    if (ctx.autoFocusSerialRef.current) {
      setTimeout(() => ctx.serialInputRef.current?.focus(), 60);
    }
    return;
  }
  setTimeout(() => window.dispatchEvent(new CustomEvent('receiving-focus-scan')), 60);
}

function dispatchTriageMatchedFeedRows(
  ctx: ScanApplyCtx,
  rows: ReceivingLineRow[],
): void {
  if (rows.length === 0) return;
  dispatchReceivingLinesPrepended({
    segments: ['scanned', 'triage-combined'],
    scope: 'triage',
    intakeSurface: 'triage',
    rows,
  });
  const byCarton = rows.find((r) => r.receiving_id != null) ?? rows[0];
  if (byCarton) {
    upsertUnboxQueueRows(ctx.queryClient, [
      { ...byCarton, client_event_id: receivingRailCartonKey(byCarton.receiving_id!) },
    ]);
  }
  deferInvalidateTriageAndUnboxQueueFeeds(ctx.queryClient);
}

function pickPoLineSummary(lines: PoLineSummary[]): PoLineSummary | null {
  const open = lines.filter(
    (l) => l.quantity_expected == null || l.quantity_received < (l.quantity_expected ?? 0),
  );
  return open[0] ?? lines[0] ?? null;
}

function buildUnboxRailMatchedRow(
  receivingId: number,
  tracking: string,
  line: PoLineSummary,
): ReceivingLineRow {
  const now = new Date().toISOString();
  return {
    ...buildMatchedStubRow(receivingId, tracking, line),
    client_event_id: receivingRailCartonKey(receivingId),
    scanned_at: now,
    // Unbox-open milestone for the rail — first-open only (server COALESCE-once).
    // Re-scans still set this optimistically; mergeRailRows keeps the cached
    // first-open stamp so the Unboxed list does not reshuffle.
    unbox_opened_at: now,
    last_activity_at: now,
  };
}

/**
 * Open a MATCHED carton from a lookup-po response: set PO context, hydrate full
 * rows, open the line. Shared by the instant local-match path and the background
 * Zoho follow-up that upgrades an unfound carton to found in place (so a late
 * Zoho match needs no re-scan).
 */
export function applyMatchedCarton(ctx: ScanApplyCtx, d: LookupPoData): void {
  const recvId = Number(d.receiving_id);
  const poIds = Array.isArray(d.po_ids) ? (d.po_ids as string[]) : [];
  ctx.onResult?.({ tracking: ctx.trackingNumber, matched: true, po_ids: poIds, receiving_id: recvId });

  const allLines = ((d.lines as Record<string, unknown>[]) || []).map((l) =>
    mapApiLineToPoSummary(l as Parameters<typeof mapApiLineToPoSummary>[0]),
  );
  // When a single open line is already known, scope PO context to that line's
  // PO group so mixed-PO cartons don't arm serials / receive counts across POs.
  const openPreview = allLines.filter(
    (l) => l.quantity_expected == null || l.quantity_received < (l.quantity_expected ?? 0),
  );
  const scopedLines =
    openPreview.length === 1 ? filterLinesByPoGroup(allLines, openPreview[0]) : allLines;
  const scopedPoIds =
    scopedLines.length < allLines.length
      ? [
          ...new Set(
            scopedLines
              .map((l) => (l.zoho_purchaseorder_id || '').trim())
              .filter((x) => x.length > 0),
          ),
        ]
      : poIds;
  const poCtx: PoContext = {
    receiving_id: recvId,
    po_ids: scopedPoIds,
    lines: scopedLines,
    receiving_package: parseReceivingPackage(d.receiving_package),
  };
  // Arming serial-scan context + the active line only makes sense if the operator
  // is still on this scan's mode. If they moved on, skip arming — the feed refresh
  // below still surfaces the carton in queue.
  if (ctx.isCurrent()) {
    ctx.setPoContext(poCtx);
    ctx.setPendingCandidates([]);

    const openLines = poCtx.lines.filter(
      (l) => l.quantity_expected == null || l.quantity_received < (l.quantity_expected ?? 0),
    );
    ctx.setArmedLineId(openLines.length === 1 ? openLines[0].id : null);

    // Optimistic OPEN: drop into a matched stub immediately so the Unbox
    // empty-pane-first unmatched flash upgrades to PO chrome (header / lines /
    // label) without waiting on include=serials hydration. Multi-line cartons
    // still refine selection after hydration via the scan-line picker rows.
    const pickForOpen = openLines[0] ?? poCtx.lines[0];
    if (pickForOpen) {
      ctx.setLineAccordionBootstrap(ctx.accordionBootstrapRef.current);
      ctx.setSelectedLine(buildMatchedStubRow(poCtx.receiving_id, ctx.trackingNumber, pickForOpen));
      ctx.setScanDriven(true);
    }
  }

  // Seed the siblings cache from lookup-po so PoLinesAccordion paints on first
  // frame — the hydration fetch below reconciles serials in the background.
  // Cache stays carton-keyed (all lines); UI scopes to the active PO at read time.
  const stubRows = allLines.map((l) =>
    buildMatchedStubRow(poCtx.receiving_id, ctx.trackingNumber, l),
  );
  seedReceivingSiblingsCache(
    ctx.queryClient,
    poCtx.receiving_id,
    stubRows,
    poCtx.receiving_package,
  );

  const unboxRailLine = pickPoLineSummary(poCtx.lines);
  if (ctx.intakeSurface === 'unbox' && unboxRailLine) {
    removePendingScanRailRow(ctx.queryClient, pendingScanReconcileKey(ctx.trackingNumber));
    upsertReceivingRailRows(ctx.queryClient, [
      buildUnboxRailMatchedRow(poCtx.receiving_id, ctx.trackingNumber, unboxRailLine),
    ]);
  } else if (unboxRailLine) {
    const now = new Date().toISOString();
    dispatchTriageMatchedFeedRows(ctx, [
      {
        ...buildMatchedStubRow(poCtx.receiving_id, ctx.trackingNumber, unboxRailLine),
        item_name: ctx.trackingNumber,
        workflow_status: 'ARRIVED',
        client_event_id: receivingRailCartonKey(poCtx.receiving_id),
        last_activity_at: now,
        created_at: now,
        scanned_at: now,
      },
    ]);
  }

  if (ctx.isCurrent()) {
    if (ctx.autoPushCameraRef.current) void ctx.publishPhotoRequestFor(poCtx.receiving_id, ctx.trackingNumber);
    refocusScanInput(ctx);
  }
  // Clear the takeover loader immediately — the optimistic stub + seeded siblings
  // cache are enough to paint the workspace; hydration reconciles in the background.
  window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));

  // Fetch full ReceivingLineRow[] so the unified LineEditPanel can open directly.
  // Single open line → auto-select; multiple → the scan-line picker renders above
  // LineEditPanel. Surface every matched line at the top of the History table and
  // refresh every receiving feed atomically.
  void (async () => {
    try {
      // include=serials matches PoLinesAccordion's own query exactly, so the cache
      // this seeds is a drop-in — the accordion mounts with full data (serials
      // included) and never does a cold fetch. Routed through queryClient.fetchQuery
      // on the SAME ['receiving-siblings', receivingId] key PoLinesAccordion uses,
      // so concurrent identical requests dedupe into one round-trip. retry:false
      // keeps the one-shot behavior.
      const linesData = await ctx.queryClient.fetchQuery({
        queryKey: receivingSiblingsQueryKey(poCtx.receiving_id),
        queryFn: async () => {
          const r = await fetch(
            `/api/receiving-lines?receiving_id=${poCtx.receiving_id}&include=serials`,
          );
          return r.json();
        },
        retry: false,
      });
      const rows = Array.isArray(linesData?.receiving_lines)
        ? (linesData.receiving_lines as ReceivingLineRow[])
        : [];
      if (rows.length > 0) {
        if (ctx.intakeSurface === 'unbox') {
          const openRows = rows.filter(
            (r) => r.quantity_expected == null || r.quantity_received < (r.quantity_expected ?? 0),
          );
          const railPick = openRows[0] ?? rows[0];
          if (railPick) {
            upsertReceivingRailRows(ctx.queryClient, [
              {
                ...railPick,
                client_event_id: receivingRailCartonKey(poCtx.receiving_id),
                // Do not stamp `now` here — mergeRailRows keeps the first-open
                // unbox_opened_at so a re-scan cannot reshuffle the Unboxed rail.
              },
            ]);
          }
        } else {
          dispatchTriageMatchedFeedRows(ctx, rows);
        }
      }
      // Open/select only if still on this scan's mode (stale-guard).
      if (ctx.isCurrent()) {
        const openRows = rows.filter(
          (r) => r.quantity_expected == null || r.quantity_received < (r.quantity_expected ?? 0),
        );
        // Fall back to the first line when all are received; only null when the
        // carton has no lines (avoids a blank workspace).
        const pick = openRows[0] ?? rows[0] ?? null;
        // Scope nav/receive counts to the picked line's PO group.
        ctx.setScanMatchedRows(pick ? filterLinesByPoGroup(rows, pick) : rows);
        ctx.setLineAccordionBootstrap(ctx.accordionBootstrapRef.current);
        ctx.setSelectedLine(pick);
        ctx.setScanDriven(true);
        if (pick) {
          const scopedPoLines = filterLinesByPoGroup(
            rows.map((r) =>
              mapApiLineToPoSummary({
                id: r.id,
                sku: r.sku,
                item_name: r.item_name,
                image_url: r.image_url ?? null,
                quantity_expected: r.quantity_expected,
                quantity_received: r.quantity_received,
                zoho_purchaseorder_id: r.zoho_purchaseorder_id,
                zoho_purchaseorder_number: r.zoho_purchaseorder_number,
                receiving_type: r.receiving_type,
                condition_grade: r.condition_grade,
              }),
            ),
            pick,
          );
          ctx.setPoContext((prev) =>
            prev && prev.receiving_id === poCtx.receiving_id
              ? {
                  ...prev,
                  lines: scopedPoLines,
                  po_ids: [
                    ...new Set(
                      scopedPoLines
                        .map((l) => (l.zoho_purchaseorder_id || '').trim())
                        .filter((x) => x.length > 0),
                    ),
                  ],
                }
              : prev,
          );
        }
      }
    } catch {
      /* silent — sidebar still has poContext for serial scans */
    }
  })();
}

/**
 * Open an UNMATCHED (unfound) carton from a lookup-po response: echo the result,
 * announce the new entry, optimistically open the workspace from a synthetic
 * stub, reconcile to the real row in the background (triage only). Live Zoho /
 * Amazon lookups are operator-initiated via {@link UnfoundMatchStrip}.
 */
export function applyUnmatchedCarton(ctx: ScanApplyCtx, d: LookupPoData): void {
  const exceptionId = typeof d.exception_id === 'number' ? d.exception_id : null;
  const exceptionReason = typeof d.exception_reason === 'string' ? d.exception_reason : null;
  ctx.onResult?.({
    tracking: ctx.trackingNumber,
    matched: false,
    po_ids: [],
    receiving_id: typeof d.receiving_id === 'number' ? d.receiving_id : undefined,
    exception_id: exceptionId,
    exception_reason: exceptionReason,
  });
  const unmatchedReceivingId = typeof d.receiving_id === 'number' ? d.receiving_id : null;
  const isUnbox = ctx.intakeSurface === 'unbox';

  if (unmatchedReceivingId != null && !isUnbox) {
    const now = new Date().toISOString();
    dispatchReceivingTriageRefresh();
    const triageStubRow: ReceivingLineRow = {
      ...buildUnmatchedStubRow(unmatchedReceivingId, ctx.trackingNumber),
      item_name: ctx.trackingNumber,
      workflow_status: 'ARRIVED',
      client_event_id: receivingRailCartonKey(unmatchedReceivingId),
      created_at: now,
      last_activity_at: now,
    };
    dispatchReceivingLinesPrepended({
      segments: ['triage-combined'],
      intakeSurface: 'triage',
      rows: [triageStubRow],
    });
    deferInvalidateTriageReceivingFeeds(ctx.queryClient);
  }

  if (unmatchedReceivingId != null && isUnbox) {
    removePendingScanRailRow(ctx.queryClient, pendingScanReconcileKey(ctx.trackingNumber));
    upsertReceivingRailRows(ctx.queryClient, [
      buildUnboxRailUnmatchedRow(unmatchedReceivingId, ctx.trackingNumber),
    ]);
  }

  // Auto-open the unfound workspace so the operator can immediately add items via
  // the Ecwid popover — no extra click on the NO PO chip.
  if (unmatchedReceivingId != null) {
    // Open the same staff's phone camera for this unmatched carton too — a tracking
    // scan still needs unboxing photos even with no PO. Stale-guard: skip if the
    // operator moved on mid-scan.
    if (ctx.isCurrent() && ctx.autoPushCameraRef.current) void ctx.publishPhotoRequestFor(unmatchedReceivingId, ctx.trackingNumber);
    // Optimistic open: drop the operator into the unfound carton's workspace
    // INSTANTLY from a synthetic stub — no round-trip wait before they can start
    // adding items. receiving-scan-resolved fires now so the scan loader clears
    // immediately. The carton is already in the feed (receiving-entry-added).
    if (ctx.isCurrent()) {
      ctx.setLineAccordionBootstrap(ctx.accordionBootstrapRef.current);
      ctx.setSelectedLine(
        isUnbox
          ? buildUnboxRailUnmatchedRow(unmatchedReceivingId, ctx.trackingNumber)
          : buildUnmatchedStubRow(unmatchedReceivingId, ctx.trackingNumber),
      );
      ctx.setScanDriven(true);
      refocusScanInput(ctx);
    }
    window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));

    // Triage only: optional background reconcile when the carton already has lines.
    if (!isUnbox) {
      void (async () => {
        try {
          const linesRes = await fetch(
            `/api/receiving-lines?receiving_id=${unmatchedReceivingId}`,
          );
          const linesData = await linesRes.json();
          const rows = Array.isArray(linesData?.receiving_lines)
            ? (linesData.receiving_lines as ReceivingLineRow[])
            : [];
          const realRow = rows[0] ?? null;
          if (realRow && ctx.isCurrent()) {
            ctx.setSelectedLine(realRow);
          }
        } catch {
          /* keep the optimistic stub — it mounts the right receiving_id */
        }
      })();
    }

    // SPEED-FIRST: no mid-scan integration ping. The first lookup-po was
    // localOnly (no Zoho), so this carton is unfound only against LOCAL data —
    // but we deliberately do NOT run a synchronous/background Zoho search on the
    // scan path. Live integration lookups are operator-initiated only (the
    // UnfoundMatchStrip "Zoho" button promotes this carton in place via
    // applyMatchedCarton), with the reconcile/incoming-PO-sync crons as the
    // crons as the passive backstop. `d.zoho_pending` is intentionally ignored
    // here on the tracking path.
  } else {
    window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
  }
}
