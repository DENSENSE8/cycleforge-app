/** Receiving scan — the effectful APPLY layer. */

import {
  deferInvalidateTriageReceivingFeeds,
  dispatchReceivingLinesPrepended,
  insertArrivalRailRows,
  noteLocalReceivingRescan,
  purgeTriageRailsAfterUnboxOpen,
  receivingSiblingsSerialsQuery,
  removePendingScanRailRow,
  seedReceivingSiblingsCache,
  unboxRailHasCarton,
  upsertReceivingRailRows,
  receivingRailCartonKey,
  receivingRailRowKey,
  receivingRailShipmentKey,
} from '@/lib/queries/receiving-queries';
import type { QueryClient } from '@tanstack/react-query';
import type { LookupPoData } from '@/lib/receiving/scan';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  buildMatchedStubRow,
  buildUnmatchedStubRow,
  buildUnboxRailUnmatchedRow,
  mapApiLineToPoSummary,
  parseReceivingPackage,
  type PoContext,
  type PoLineSummary,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { filterLinesByPoGroup } from '@/lib/receiving/po-group-title';
import type { ScanApplyCtx } from './scan-types';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import { photoStageForScanIntakeSurface } from '@/lib/receiving/photo-intent';
import { settleUnboxScanVerdict } from '@/lib/receiving/unbox-scan-feedback-store';

/** Announce that this scan was an INSPECTION of finished work, not work. */
/** Read the lookup verdict off a lookup-po response. */
function lookupScanFieldsFrom(d: LookupPoData): {
  unboxedAt?: string | null;
  unboxedByName?: string | null;
  poNumber?: string | null;
} {
  if (d.scan_kind !== 'lookup') return {};
  return {
    unboxedAt: typeof d.unboxed_at === 'string' ? d.unboxed_at : null,
    unboxedByName: typeof d.unboxed_by_name === 'string' ? d.unboxed_by_name : null,
    poNumber: typeof d.po_number === 'string' ? d.po_number : null,
  };
}

function withLookupHeaderSeed(row: ReceivingLineRow, d: LookupPoData): ReceivingLineRow {
  const pkg = d.receiving_package;
  if (pkg && typeof pkg === 'object') {
    const listing = (pkg as { listing_url?: unknown }).listing_url;
    if (typeof listing === 'string' && listing.trim()) {
      row = { ...row, receiving_listing_url: listing };
    }
  }
  // Seed only a FOUND ticket: lookup-po sees carton links only, so its
  // "none" is not authoritative and by-entity must still answer.
  const raw = d.support_ticket;
  if (raw == null || typeof raw !== 'object') return row;
  const ticket = raw as Record<string, unknown>;
  const id = Number(ticket.id);
  if (!Number.isFinite(id) || id <= 0) return row;
  const providerTicketId = Number(ticket.providerTicketId);
  return {
    ...row,
    linked_support_ticket: {
      id,
      label: typeof ticket.label === 'string' ? ticket.label : `#${id}`,
      provider: typeof ticket.provider === 'string' ? ticket.provider : 'zendesk',
      externalTicketId: typeof ticket.externalTicketId === 'string' ? ticket.externalTicketId : null,
      providerTicketId: Number.isFinite(providerTicketId) && providerTicketId > 0 ? providerTicketId : null,
      openUrl: typeof ticket.openUrl === 'string' ? ticket.openUrl : null,
      subject: typeof ticket.subject === 'string' ? ticket.subject : null,
      status: typeof ticket.status === 'string' ? ticket.status : null,
    },
  };
}

function announceUnboxLookupScan(detail: UnboxLookupScanDetail): void {
  emitReceiving('receiving-lookup-scan', detail);
}

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

/** The single client chokepoint for "a scan OPENED this carton on the Unbox surface". */
export function applyUnboxCartonOpened(
  queryClient: QueryClient,
  args: {
    receivingId: number;
    trackingNumber: string;
    /** Row to add for a carton the Unboxed rail does not list yet; ignored when it does. */
    railRow?: ReceivingLineRow | null;
    /** Fire touch-scan; `tracking` overrides the scanned value (Phase-0 uses the carton's own). */
    touchScan?: { tracking?: string };
    /** The resolved carton's `unboxed_at`, when the rung already knows it (the cache / local-tracking / internal-code rungs all resolve a real… */
    unboxedAt?: string | null;
    /** Receipt facts, when the rung's payload already carries them. */
    unboxedByName?: string | null;
    poNumber?: string | null;
  },
): void {
  // A carton already on the rail is a RE-SCAN: its row stays exactly where and
  // what it is (no optimistic overwrite, no reorder), and the realtime echo of
  // this scan is ours, so it must not refetch the rail either.
  const onRail = unboxRailHasCarton(queryClient, args.receivingId);
  if (onRail) noteLocalReceivingRescan(args.receivingId);

  if (args.unboxedAt) {
    // READ-ONLY against the rail.
    announceUnboxLookupScan({
      receivingId: args.receivingId,
      trackingNumber: args.trackingNumber,
      unboxedAt: args.unboxedAt,
      unboxedByName: args.unboxedByName ?? null,
      poNumber: args.poNumber ?? null,
    });
  } else {
    purgeTriageRailsAfterUnboxOpen(queryClient, args.receivingId);
  }

  if (!onRail && !args.unboxedAt && args.railRow) {
    // First open: the carton row lands on the scan's pending row (same
    // canonical shipment key) and upgrades it in place — no exit / re-enter.
    upsertReceivingRailRows(queryClient, [
      {
        ...args.railRow,
        client_event_id: String(
          receivingRailRowKey({
            tracking_number: args.railRow.tracking_number ?? args.trackingNumber,
            receiving_id: args.receivingId,
          }),
        ),
      },
    ]);
  }
  // Whatever pending row is left for this scan was ours; only a carton-less row can go.
  removePendingScanRailRow(queryClient, receivingRailShipmentKey(args.trackingNumber));

  // `touchScan` still fires for BOTH kinds — it is what records the
  // RECEIVING_LOOKUP_SCAN event for the client short-circuit rungs. Skipping it
  // on a lookup would leave the inspection unlogged entirely.

  if (args.touchScan) {
    void fetch('/api/receiving/touch-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiving_id: args.receivingId,
        tracking_number: args.touchScan.tracking ?? args.trackingNumber,
        intakeSurface: 'unbox',
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Server is the authority on WORK vs LOOKUP (it reads the carton's own
        // milestone). Covers the rungs that opened from a stub and never had
        // `unboxed_at` client-side.
        if (data?.scan_kind === 'lookup') {
          announceUnboxLookupScan({
            receivingId: args.receivingId,
            trackingNumber: args.trackingNumber,
            unboxedAt: typeof data.unboxed_at === 'string' ? data.unboxed_at : null,
            unboxedByName: typeof data.unboxed_by_name === 'string' ? data.unboxed_by_name : null,
            poNumber: typeof data.po_number === 'string' ? data.po_number : null,
          });
        }
      })
      .catch(() => {});
  }
}

/**
 * Every Arrival scan lands on the Arrival rail: add the carton if the rail does
 * not list it yet (a listed one is left as is), then reconcile against the
 * server. The station lines table takes the same rows over its own event.
 */
export function showOnArrivalRail(queryClient: QueryClient, rows: ReceivingLineRow[]): void {
  if (rows.length === 0) return;
  insertArrivalRailRows(queryClient, rows);
  dispatchReceivingLinesPrepended({ intakeSurface: 'triage', rows });
  deferInvalidateTriageReceivingFeeds(queryClient);
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
    client_event_id: String(
      receivingRailRowKey({ tracking_number: tracking, receiving_id: receivingId }),
    ),
    scanned_at: now,
    // Unbox-open milestone for the rail — first-open only (server COALESCE-once).
    // Re-scans still set this optimistically; mergeRailRows keeps the cached
    // first-open stamp so the Unboxed list does not reshuffle.
    unbox_opened_at: now,
    last_activity_at: now,
  };
}

/** Open a MATCHED carton from a lookup-po response: */
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

    const openLines = poCtx.lines.filter(
      (l) => l.quantity_expected == null || l.quantity_received < (l.quantity_expected ?? 0),
    );
    ctx.setArmedLineId(openLines.length === 1 ? openLines[0].id : null);

    // Optimistic OPEN:
    const pickForOpen = openLines[0] ?? poCtx.lines[0];
    if (pickForOpen) {
      ctx.setLineAccordionBootstrap(ctx.accordionBootstrapRef.current);
      ctx.setSelectedLine(
        withLookupHeaderSeed(
          buildMatchedStubRow(poCtx.receiving_id, ctx.trackingNumber, pickForOpen, poCtx.receiving_package),
          d,
        ),
      );
      ctx.setScanDriven(true);
    }
  }

  // Seed the siblings cache from lookup-po so PoLinesAccordion paints on first
  // frame — the hydration fetch below reconciles serials in the background.
  // Cache stays carton-keyed (all lines); UI scopes to the active PO at read time.
  const stubRows = allLines.map((l) =>
    buildMatchedStubRow(poCtx.receiving_id, ctx.trackingNumber, l, poCtx.receiving_package),
  );
  seedReceivingSiblingsCache(
    ctx.queryClient,
    poCtx.receiving_id,
    stubRows,
    poCtx.receiving_package,
  );

  const unboxRailLine = pickPoLineSummary(poCtx.lines);
  if (ctx.intakeSurface === 'unbox') {
    settleUnboxScanVerdict(ctx.trackingNumber, {
      phase: 'found',
      receivingId: poCtx.receiving_id,
      lineCount: allLines.length,
    });
    // Server already stamped unbox_opened (lookup-po intakeSurface):
    applyUnboxCartonOpened(ctx.queryClient, {
      receivingId: poCtx.receiving_id,
      trackingNumber: ctx.trackingNumber,
      railRow: unboxRailLine
        ? buildUnboxRailMatchedRow(poCtx.receiving_id, ctx.trackingNumber, unboxRailLine)
        : null,
      ...lookupScanFieldsFrom(d),
    });
  } else if (unboxRailLine) {
    const now = new Date().toISOString();
    showOnArrivalRail(ctx.queryClient, [
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
    if (ctx.autoPushCameraRef.current) {
      void ctx.publishPhotoRequestFor(
        poCtx.receiving_id,
        ctx.trackingNumber,
        photoStageForScanIntakeSurface(ctx.intakeSurface),
      );
    }
    refocusScanInput(ctx);
  }
  // Clear the takeover loader immediately — the optimistic stub + seeded siblings
  // cache are enough to paint the workspace; hydration reconciles in the background.
  window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));

  // Full ReceivingLineRow[] so the unified LineEditPanel can open directly —
  // the SAME `include=serials` read the line pane runs, so it loads once.
  void (async () => {
    try {
      const linesData = await ctx.queryClient.fetchQuery({
        ...receivingSiblingsSerialsQuery(poCtx.receiving_id),
        retry: false,
      });
      const rows = Array.isArray(linesData?.receiving_lines) ? linesData.receiving_lines : [];
      if (rows.length > 0) {
        // The pane's metadata cache gets the full rows over the lookup stubs.
        seedReceivingSiblingsCache(
          ctx.queryClient,
          poCtx.receiving_id,
          rows,
          linesData.receiving_package ?? poCtx.receiving_package,
        );
        if (ctx.intakeSurface === 'unbox') {
          const openRows = rows.filter(
            (r) => r.quantity_expected == null || r.quantity_received < (r.quantity_expected ?? 0),
          );
          const railPick = openRows[0] ?? rows[0];
          // In place only — the carton's rail row is already where it belongs
          // (first open landed it; a re-scan never moves it). mergeRailRows keeps
          // the first-open unbox_opened_at so nothing reshuffles.
          upsertReceivingRailRows(
            ctx.queryClient,
            [
              {
                ...railPick,
                client_event_id: String(
                  receivingRailRowKey({
                    tracking_number: railPick.tracking_number ?? ctx.trackingNumber,
                    receiving_id: poCtx.receiving_id,
                  }),
                ),
              },
            ],
            'patch',
          );
        } else {
          showOnArrivalRail(ctx.queryClient, rows);
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
                source_order_id: r.source_order_id,
                inbound_source_type: r.inbound_source_type,
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

/** Open an UNMATCHED (unfound) carton from a lookup-po response: */
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
    const triageStubRow: ReceivingLineRow = {
      ...buildUnmatchedStubRow(unmatchedReceivingId, ctx.trackingNumber),
      item_name: ctx.trackingNumber,
      workflow_status: 'ARRIVED',
      client_event_id: receivingRailCartonKey(unmatchedReceivingId),
      created_at: now,
      last_activity_at: now,
    };
    showOnArrivalRail(ctx.queryClient, [triageStubRow]);
  }

  if (unmatchedReceivingId != null && isUnbox) {
    // Unfound: the header line says so, then finds the Zendesk ticket that
    // mentions this tracking and links it to the carton.
    settleUnboxScanVerdict(ctx.trackingNumber, {
      phase: 'unfound',
      receivingId: unmatchedReceivingId,
      lineCount: 0,
    });
    // Server stamped unbox_opened for this unfound carton (lookup-po
    // intakeSurface) — chokepoint lands the carton row, purges Arrival.
    applyUnboxCartonOpened(ctx.queryClient, {
      receivingId: unmatchedReceivingId,
      trackingNumber: ctx.trackingNumber,
      railRow: buildUnboxRailUnmatchedRow(unmatchedReceivingId, ctx.trackingNumber),
      ...lookupScanFieldsFrom(d),
    });
  }

  // Auto-open the unfound workspace so the operator can immediately add items via
  // the Ecwid popover — no extra click on the NO PO chip.
  if (unmatchedReceivingId != null) {
    // Open the same staff's phone camera for this unmatched carton too — a tracking
    // scan still needs unboxing photos even with no PO. Stale-guard: skip if the
    // operator moved on mid-scan.
    if (ctx.isCurrent() && ctx.autoPushCameraRef.current) {
      void ctx.publishPhotoRequestFor(
        unmatchedReceivingId,
        ctx.trackingNumber,
        photoStageForScanIntakeSurface(ctx.intakeSurface),
      );
    }
    // Optimistic open:
    if (ctx.isCurrent()) {
      ctx.setLineAccordionBootstrap(ctx.accordionBootstrapRef.current);
      ctx.setSelectedLine(
        withLookupHeaderSeed(
          isUnbox
            ? buildUnboxRailUnmatchedRow(unmatchedReceivingId, ctx.trackingNumber)
            : buildUnmatchedStubRow(unmatchedReceivingId, ctx.trackingNumber),
          d,
        ),
      );
      ctx.setScanDriven(true);
      refocusScanInput(ctx);
    }
    window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));

    // Triage only: background reconcile when the carton already has lines.
    if (!isUnbox) {
      void (async () => {
        try {
          const linesData = await ctx.queryClient.fetchQuery({
            ...receivingSiblingsSerialsQuery(unmatchedReceivingId),
            retry: false,
          });
          const rows = Array.isArray(linesData?.receiving_lines) ? linesData.receiving_lines : [];
          if (rows.length > 0) {
            seedReceivingSiblingsCache(
              ctx.queryClient,
              unmatchedReceivingId,
              rows,
              linesData.receiving_package,
            );
          }
          const realRow = rows[0] ?? null;
          if (realRow && ctx.isCurrent()) {
            ctx.setSelectedLine(realRow);
          }
        } catch {
          /* keep the optimistic stub — it mounts the right receiving_id */
        }
      })();
    }

    // SPEED-FIRST: no mid-scan integration ping.
  } else {
    window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
  }
}
