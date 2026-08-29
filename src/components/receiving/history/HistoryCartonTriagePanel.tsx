'use client';

/**
 * Unbox History left-click triage inspector — Desk-family RightRailHost card
 * (`detail:history`, non-modal **push**). DeskInspectorIndexShell topics + one
 * primary CTA; full station work stays on LineEditPanel (double-click / Open in
 * Unbox). Mutually exclusive with LineEditPanel / StationDisplaysPushColumn — opening the
 * workspace closes this rail.
 *
 * Stack (ONE band → index|leaf → View strip → floor):
 *   1. {@link DeskInspectorIndexShell} — the single band
 *      (`[‹ Back] [Details] ……… [View toggle] [⤢] [✕]`) over the Root Index →
 *      leaf stage: Details · Logistics · Evidence · History.
 *   2. The View topics cluster, a disclosure docked UNDER the work (forced open
 *      in the View-only shell, where the band reads `View` and owes no Back).
 *   3. {@link InspectorActionFloor} bottom dock (n=1) — primary CTA (Print ·
 *      Open/Continue/Match in Unbox) + More on the dominant side, flush trailing
 *      Delete carton isolated at the far edge. This is the record's edit gravity;
 *      the band stays navigation-only so a Park never sits by a Delete.
 * Topics live ONLY on this push inspector — never on Unbox History Band 3.
 * Never mounts station Displays push stack on RightRailHost.
 *
 * **Three rows of chrome collapsed to one on 2026-08-21.** A `h-9` View-toggle
 * row, the View strip and a status + PO identity pair each sat ABOVE the shell's
 * band, so the panel read as four stacked headers; worse, on the View-only and
 * loading paths the shell was not mounted at all, so no band existed and nothing
 * reserved the cell the host paints its singleton `✕` / `⤢` into — the controls
 * landed on top of whatever content happened to be under them. The toggle moved
 * into the band's trailing cluster, the identity pair into the Details leaf
 * (a record's identity is a body fact once the title cell is the topic), the
 * loading skeleton into that same leaf so the band is always mounted, and the
 * View strip below the stage. This panel paints NO close of its own — the host
 * owns it, and `closeRightPanel()` runs this occupant's `onClose` teardown.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Printer,
  Search,
  SlidersHorizontal,
} from '@/components/Icons';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import {
  FLOOR_DELETE_PEER_CLASS,
  FloorIconButton,
  FloorOverflowButton,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import {
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
  getDetailInspectorCollapsed,
  type DetailInspectorCollapseDetail,
} from '@/design-system/shells/detail-stack';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMeta } from '@/lib/source-platform';
import {
  PaneHeaderLabel,
  PaneHeaderStatusPill,
} from '@/components/ui/pane-header';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { ReceivingPhotosSection } from '@/components/station/receiving/ReceivingPhotosSection';
import { ReceivingAuditPanel } from '@/components/receiving/workspace/ReceivingAuditPanel';
import { buildHistoryInspectorLeaves } from '@/components/receiving/history/build-history-inspector-leaves';
import { IconButton } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import type { HistoryTriageTarget } from '@/lib/receiving/history-triage-row';
import { isHistoryUnfoundRow } from '@/lib/receiving/history-triage-row';
import {
  historyInspectorMoreItems,
  historyInspectorPrimaryAction,
  historyInspectorTopicActions,
  type HistoryInspectorDisplayTopic,
} from '@/lib/receiving/history-inspector-topics';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { removeReceivingRailByCarton } from '@/lib/queries/receiving-queries';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';
import {
  deriveCartonReadiness,
  type ReceivingMatchLine,
} from '@/lib/receiving/carton-readiness';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { dispatchReceivingOpenPairingPo } from '@/utils/events';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

const HISTORY_TRIAGE_RAIL_ID = 'detail:history';

const DISPLAY_TOPICS: ReadonlyArray<HistoryInspectorDisplayTopic> = [
  'summary',
  'logistics',
  'photos',
  'audit',
];

type CartonPayload = {
  id: number;
  zoho_purchaseorder_number?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
  source_platform?: string | null;
  current_status?: string | null;
  workflow_status?: string | null;
  location_name?: string | null;
  tracking_scanned_at?: string | null;
  unboxed_at?: string | null;
  received_at?: string | null;
  pairing_state?: string | null;
  source?: string | null;
};

async function fetchCarton(receivingId: number): Promise<CartonPayload | null> {
  const res = await fetch(`/api/receiving/${receivingId}`);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { receiving?: CartonPayload } | null;
  return json?.receiving ?? null;
}

async function fetchMatchLines(receivingId: number): Promise<ReceivingMatchLine[]> {
  const res = await fetch(
    `/api/receiving/match?receiving_id=${encodeURIComponent(String(receivingId))}`,
  );
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.matched_lines) ? (json.matched_lines as ReceivingMatchLine[]) : [];
}

async function fetchLineRow(
  receivingId: number,
  lineId: number | null,
): Promise<ReceivingLineRow | null> {
  const res = await fetch(
    `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const rows = Array.isArray(data?.receiving_lines)
    ? (data.receiving_lines as ReceivingLineRow[])
    : [];
  if (lineId != null) {
    const hit = rows.find((r) => r.id === lineId);
    if (hit) return hit;
  }
  return rows[0] ?? null;
}

export function HistoryCartonTriagePanel({
  target,
  onClose,
}: {
  /** Null = View-only shell (sheet layout / refine; no carton identity). */
  target: HistoryTriageTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Read here (inside the provider) — the rail body renders under RightRailHost.
  const viewChrome = useHistoryViewChromeOptional();
  const [opening, setOpening] = useState(false);
  /** Index | leaf nav — opens on Details; Back → topics. */
  const [navId, setNavId] = useState<string>('summary');
  const [viewTopicsOpen, setViewTopicsOpen] = useState(false);

  const viewOnly = target == null;
  const receivingId = target?.receivingId ?? null;

  // View-only shell: View strip is the whole job — force open.
  useEffect(() => {
    if (viewOnly) setViewTopicsOpen(true);
  }, [viewOnly]);

  const cartonQuery = useQuery({
    queryKey: ['history-triage-carton', receivingId] as const,
    queryFn: () => fetchCarton(receivingId!),
    staleTime: 10_000,
    enabled: receivingId != null,
  });

  const matchQuery = useQuery({
    queryKey: ['history-triage-match', receivingId] as const,
    queryFn: () => fetchMatchLines(receivingId!),
    staleTime: 10_000,
    enabled: receivingId != null,
  });

  const lineQuery = useQuery({
    queryKey: ['history-triage-line', receivingId, target?.receivingLineId] as const,
    queryFn: () => fetchLineRow(receivingId!, target!.receivingLineId),
    staleTime: 10_000,
    enabled: receivingId != null,
  });

  const carton = cartonQuery.data;
  const line = lineQuery.data;

  const poNumber =
    (carton?.zoho_purchaseorder_number || target?.poNumber || '').trim() || null;
  const tracking =
    (carton?.tracking_number || target?.tracking || '').trim() || null;
  const title =
    (
      line?.zoho_item_title ||
      line?.catalog_product_title ||
      line?.item_name ||
      target?.title ||
      ''
    ).trim() || null;
  const statusRaw =
    (line?.workflow_status || carton?.current_status || target?.status || '').trim() ||
    null;
  const statusLabel = statusRaw ? workflowStageLabel(statusRaw) : null;

  const unfound = useMemo(() => {
    if (viewOnly) return false;
    if (line) return isHistoryUnfoundRow(line);
    const source = (carton?.source || '').trim().toLowerCase();
    const pairing = (carton?.pairing_state || '').trim().toUpperCase();
    return source === 'unmatched' || pairing === 'UNFOUND' || !poNumber;
  }, [viewOnly, line, carton, poNumber]);

  const readiness = useMemo(() => {
    if (!carton) return null;
    return deriveCartonReadiness(
      {
        tracking_scanned_at: carton.tracking_scanned_at ?? null,
        unboxed_at: carton.unboxed_at ?? null,
        received_at: carton.received_at ?? null,
      },
      matchQuery.data,
    );
  }, [carton, matchQuery.data]);

  const topicSpecs = useMemo(
    () =>
      historyInspectorTopicActions({
        unfound,
        readinessCta: readiness?.cta ?? null,
        viewOnly,
      }),
    [unfound, readiness?.cta, viewOnly],
  );

  const primaryAction = useMemo(
    () =>
      viewOnly
        ? null
        : historyInspectorPrimaryAction({
            unfound,
            readinessCta: readiness?.cta ?? null,
          }),
    [viewOnly, unfound, readiness?.cta],
  );

  const moreItems = useMemo(
    () =>
      viewOnly
        ? []
        : historyInspectorMoreItems({
            unfound,
            readinessCta: readiness?.cta ?? null,
          }),
    [viewOnly, unfound, readiness?.cta],
  );

  // Print + Open in Unbox are dedicated icon peers on the floor now, so the
  // visible `⋯` overflow holds only the secondary verbs (flag · photo ·
  // holding) — never a duplicate of a verb that already has its own icon
  // (golden rule). The Alt-shortcut handler still reads full `moreItems`, so
  // ⌥P / ⌥U keep keyboard parity with the Print / Edit icons.
  const moreDisplay = useMemo(
    () => moreItems.filter((item) => item.key !== 'print' && item.key !== 'unbox'),
    [moreItems],
  );

  const openInUnbox = useCallback(
    async (opts?: { pairing?: boolean }) => {
      if (opening || !target) return;
      setOpening(true);
      try {
        const row =
          line ?? (await fetchLineRow(target.receivingId, target.receivingLineId));
        if (!row) {
          router.push(openInUnboxHref(target.receivingId, target.receivingLineId ?? undefined));
          onClose();
          return;
        }
        onClose();
        dispatchSelectLine(row);
        if (opts?.pairing) {
          window.requestAnimationFrame(() => dispatchReceivingOpenPairingPo());
        }
      } finally {
        setOpening(false);
      }
    },
    [opening, line, target, router, onClose],
  );

  // Destructive floor — deletes the whole carton (`receiving_carton`), matching
  // the sibling desk peeks (Orders / Incoming). Throws on failure so
  // `InspectorFlushDelete` skips its `onDeleted` (keeps the panel open).
  // Refresh: rail cache mirror + `receiving-lines-table` query (the History grid
  // re-seeds `localRows` from it) + the shared `receiving-entry-deleted` event.
  const handleDelete = useCallback(async () => {
    if (viewOnly || !target) return;
    const receivingId = target.receivingId;
    const res = await fetch(
      `/api/receiving-logs?id=${encodeURIComponent(String(receivingId))}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const msg = body?.error || `Delete failed (${res.status})`;
      toast.error(msg);
      throw new Error(msg);
    }
    removeReceivingRailByCarton(queryClient, receivingId);
    void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
    emitReceiving('receiving-entry-deleted', receivingId);
    toast.success('Carton deleted');
  }, [viewOnly, target, queryClient]);

  const handlePrint = useCallback(() => {
    const sku = (line?.sku || '').trim();
    if (!sku) {
      toast.info('Open in Unbox to print a carton label');
      void openInUnbox();
      return;
    }
    const serials = (line?.serials ?? [])
      .map((s) => (s.serial_number || '').trim())
      .filter(Boolean);
    if (serials.length > 0) {
      printProductLabel({ sku, serialNumber: serials[0]! });
    } else {
      printProductLabel({ sku });
    }
    toast.success('Printing label');
  }, [line, openInUnbox]);

  const runPrimary = useCallback(() => {
    if (!primaryAction) return;
    switch (primaryAction.key) {
      case 'print':
        handlePrint();
        return;
      case 'unbox':
        void openInUnbox();
        return;
      case 'link':
        void openInUnbox({ pairing: true });
        return;
    }
  }, [primaryAction, handlePrint, openInUnbox]);

  // Edit icon = the record's edit gravity: open this carton in Unbox (an
  // unfound carton opens straight into pairing so Edit doubles as Resolve/Match).
  const editLabel = unfound ? 'Resolve in Unbox' : 'Open in Unbox';
  const openEdit = useCallback(() => {
    void openInUnbox({ pairing: unfound });
  }, [openInUnbox, unfound]);

  const runMoreItem = useCallback(
    (key: string) => {
      switch (key) {
        case 'print':
          handlePrint();
          return;
        case 'unbox':
          void openInUnbox();
          return;
        case 'flag':
        case 'holding':
        case 'photo':
          void openInUnbox();
          return;
        default:
          return;
      }
    },
    [handlePrint, openInUnbox],
  );

  const selectDisplayTopic = useCallback((topic: HistoryInspectorDisplayTopic) => {
    setNavId(topic);
  }, []);

  const onNavChange = useCallback((id: string) => {
    setNavId(id);
  }, []);

  // Panel-scoped hotkeys — wedge-safe: topic / More letters require Alt
  // (bare keys are banned on scan-adjacent desks). Enter stays for primary.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) {
        return;
      }
      if (isEditableKeyTarget(event.target)) return;

      const key = event.key;
      if (key === 'Enter' && !event.altKey && !viewOnly && primaryAction) {
        event.preventDefault();
        runPrimary();
        return;
      }

      if (!viewOnly && event.altKey && !event.shiftKey) {
        if (key >= '1' && key <= '4') {
          const topic = DISPLAY_TOPICS[Number(key) - 1];
          if (topic) {
            event.preventDefault();
            selectDisplayTopic(topic);
            return;
          }
        }

        const upper = key.length === 1 ? key.toUpperCase() : key;
        const moreHit = moreItems.find((item) => item.shortcut === upper);
        if (moreHit) {
          event.preventDefault();
          runMoreItem(moreHit.key);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewOnly, primaryAction, moreItems, runPrimary, runMoreItem, selectDisplayTopic]);

  // Seed Details leaf when a carton target lands (View-only has no topics).
  useEffect(() => {
    if (viewOnly) return;
    setNavId('summary');
  }, [viewOnly, receivingId]);

  const qtyExpected = line?.quantity_expected ?? null;
  const qtyReceived = line?.quantity_received ?? null;
  const qtyLabel =
    qtyExpected != null
      ? `${qtyReceived ?? 0}/${qtyExpected}`
      : qtyReceived != null
        ? String(qtyReceived)
        : null;
  const price =
    line?.unit_price != null && Number.isFinite(Number(line.unit_price)) && Number(line.unit_price) > 0
      ? formatCurrency(Number(line.unit_price))
      : null;
  const channel = (line?.source_platform || carton?.source_platform || '').trim() || null;
  const location =
    (line?.staging_location_label || carton?.location_name || '').trim() || null;

  const viewStripOpen = viewOnly || viewTopicsOpen;
  // Parked (Band 3 `Hide inspector` / ⌘\) keeps this panel MOUNTED but inert at
  // zero width, so `viewStripOpen` alone cannot tell the cluster whether it is
  // reachable. Read the collapse SoT the toggle writes.
  const [inspectorParked, setInspectorParked] = useState(() =>
    getDetailInspectorCollapsed(),
  );
  useEffect(() => {
    const onCollapse = (event: Event) => {
      const detail = (event as CustomEvent<DetailInspectorCollapseDetail>).detail;
      if (!detail || typeof detail.collapsed !== 'boolean') return;
      setInspectorParked(detail.collapsed);
    };
    window.addEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
    return () => window.removeEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
  }, []);

  /**
   * The band's only verb — show / hide the View topics cluster. It is NOT topic
   * nav (topics live in the shell's index), and it never appears in the
   * View-only shell, where the cluster is the whole job and forced open.
   */
  const viewToggle = viewOnly ? null : (
    <span className="flex h-full items-center" data-testid="history-triage-view-chrome">
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel={viewTopicsOpen ? 'Hide view controls' : 'Show view controls'}
        aria-pressed={viewTopicsOpen}
        icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
        onClick={() => setViewTopicsOpen((open) => !open)}
        data-testid="history-triage-view-toggle"
      />
    </span>
  );

  return (
    <DetailStackRailRegistrar
      id={HISTORY_TRIAGE_RAIL_ID}
      onClose={onClose}
      modal={false}
      // Park via Band 3 toggle / Cmd+\ / edge chevron — keep target mounted.
      edgeCollapse
      // Band 3 owns the sole reopen icon — no parked 32px host rail.
      collapsedStrip={false}
      ariaLabel={
        viewOnly
          ? 'Unbox view controls'
          : poNumber
            ? `History triage for PO ${poNumber}`
            : `History triage for receiving ${target!.receivingId}`
      }
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="history-carton-triage-panel"
        data-history-view-only={viewOnly ? '' : undefined}
      >
        {/* View-only shell — no carton, so no index above it and no Back owed.
            It still paints the ONE band so the host's `⤢` / `✕` have a row of
            the right height under them. `shrink-0` keeps the View strip docked
            directly beneath the hint instead of at the far bottom. */}
        {viewOnly ? (
          <div className="flex shrink-0 flex-col">
            <DeskInspectorIndexShell
              stance="standalone"
              title="View"
              ariaLabel="Unbox view controls"
              testId="history-view-shell"
              body={
                <p
                  className="px-3 py-2 text-role-caption text-text-soft"
                  data-testid="history-triage-view-only-hint"
                >
                  Sheet layout &amp; filters — select a row for carton details.
                </p>
              }
            />
          </div>
        ) : null}

        {!viewOnly && target ? (
            <DeskInspectorIndexShell
              stance="index"
              leaves={buildHistoryInspectorLeaves({
                topics: topicSpecs.display.map(
                  (spec) => spec.key as HistoryInspectorDisplayTopic,
                ),
                contents: {
                  summary: (
                    <div
                      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
                      data-history-topic="summary"
                    >
                      {/* Record identity — status + the short PO / Carton key.
                          BODY, not a second header line: the band's title cell
                          is the current topic. */}
                      <div
                        className="flex items-center gap-2"
                        data-testid="history-triage-identity"
                      >
                        {statusLabel ? (
                          <PaneHeaderStatusPill tone="neutral">{statusLabel}</PaneHeaderStatusPill>
                        ) : null}
                        <PaneHeaderLabel
                          eyebrow={poNumber ? 'Purchase order #' : 'Carton'}
                          value={poNumber ?? `#${target.receivingId}`}
                          valueTitle={poNumber ?? `Carton #${target.receivingId}`}
                        />
                      </div>

                      {cartonQuery.isLoading && !carton ? (
                        <SkeletonList count={4} type="row" />
                      ) : (
                      <section className="space-y-2">
                        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                          {unfound ? 'PO linking' : 'Order summary'}
                        </h3>
                        {unfound ? (
                          <div
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg border border-dashed border-border-strong',
                              'bg-surface-sunken px-3 py-3 text-left text-role-caption text-text-soft',
                            )}
                          >
                            <Search className="h-4 w-4 shrink-0" aria-hidden />
                            <span>
                              No PO linked — use Resolve Unfound on the identity row
                            </span>
                          </div>
                        ) : (
                          <OrderFactList>
                            <OrderFactRow label="PO" value={poNumber} mono omitWhenEmpty />
                            <OrderFactRow label="Title" value={title} omitWhenEmpty />
                            <OrderFactRow
                              label="Next step"
                              value={readiness?.nextStep ?? null}
                              omitWhenEmpty
                            />
                          </OrderFactList>
                        )}
                      </section>
                      )}
                    </div>
                  ),
                  logistics: (
                    <div
                      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
                      data-history-topic="logistics"
                    >
                      <section className="space-y-2">
                        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                          Logistics &amp; channel
                        </h3>
                        <OrderFactList>
                          <OrderFactRow
                            label="Tracking"
                            value={
                              tracking ? (
                                <TrackingNumberMenuChip
                                  value={tracking}
                                  carrierHint={carton?.carrier ?? line?.carrier}
                                  dense
                                />
                              ) : null
                            }
                            omitWhenEmpty
                          />
                          <OrderFactRow
                            label="Channel"
                            value={
                              channel
                                ? (() => {
                                    const meta = sourcePlatformMeta(channel);
                                    return (
                                      <HoverTooltip label={meta.label || channel} asChild focusable={false}>
                                        <span className="inline-flex shrink-0" aria-label={meta.label || channel}>
                                          <PlatformMark
                                            platformValue={meta.value || channel}
                                            meta={meta.value ? meta : undefined}
                                          />
                                        </span>
                                      </HoverTooltip>
                                    );
                                  })()
                                : null
                            }
                            omitWhenEmpty
                          />
                          <OrderFactRow label="Price" value={price} omitWhenEmpty />
                          <OrderFactRow label="Qty" value={qtyLabel} omitWhenEmpty />
                          <OrderFactRow label="Location" value={location} omitWhenEmpty />
                        </OrderFactList>
                      </section>
                    </div>
                  ),
                  photos: (
                    <div
                      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
                      data-history-topic="photos"
                    >
                      <section className="space-y-2">
                        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                          Photo evidence
                        </h3>
                        <ReceivingPhotosSection
                          receivingId={String(target.receivingId)}
                          poRef={poNumber}
                          readOnly
                          hideHeader
                          launcherTitle="Scan bench photos"
                        />
                      </section>
                    </div>
                  ),
                  audit: (
                    <div
                      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
                      data-history-topic="audit"
                    >
                      <section className="space-y-2">
                        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                          Audit
                        </h3>
                        <ReceivingAuditPanel
                          open
                          receivingId={target.receivingId}
                          onClose={onClose}
                          hideHeader
                        />
                      </section>
                    </div>
                  ),
                },
              })}
              activeId={navId}
              onActiveIdChange={onNavChange}
              ariaLabel="History topics"
              testId="history-inspector-index"
              backLabel="Back to topics"
              // View toggle rides the ONE band on both stages — it used to own
              // a `h-9` row of its own above it.
              indexRightSlot={viewToggle}
              leafTrailing={viewToggle}
            />
        ) : null}

        {/* View topics cluster — a disclosure docked under the work, never a
            second header band. Mounted in BOTH stances so its ▦ portal target
            never detaches; `active` is what gates publishing it. */}
        <div
          className={cn(
            'shrink-0 border-t border-border-soft px-2 py-1',
            !viewStripOpen && 'hidden',
          )}
          data-testid="history-triage-view-strip"
        >
          <HistoryViewChromeBridge value={viewChrome}>
            <HistoryViewTopicsCluster
              hidePaint={viewOnly}
              active={viewStripOpen && !inspectorParked}
            />
          </HistoryViewChromeBridge>
        </div>

        {/* Icons-first Macro floor (n=1) — the record's edit gravity:
            `⋯` More · 🖨 Print · ✏️ Edit (Open in Unbox) · 🗑 Delete as equal
            fill-width peers, docked BELOW the topic shell so a Park in the top
            chrome never sits beside the Delete. View-only shell (n=0) never
            mounts it. Delete grain: `DELETE /api/receiving-logs`. */}
        {!viewOnly && target ? (
          <InspectorActionFloor>
            <FloorOverflowButton
              items={
                opening
                  ? []
                  : moreDisplay.map((item) => ({
                      key: item.key,
                      label: item.label,
                      shortcut: item.shortcut,
                      onSelect: () => runMoreItem(item.key),
                    }))
              }
              data-testid="history-triage-more"
            />
            <FloorIconButton
              icon={<Printer />}
              label={unfound ? 'Print needs a linked SKU' : 'Print'}
              onClick={handlePrint}
              disabled={opening || unfound}
              data-testid="history-triage-print"
            />
            <FloorIconButton
              icon={<Pencil />}
              label={editLabel}
              onClick={openEdit}
              disabled={opening}
              busy={opening}
              data-testid="history-triage-primary-cta"
            />
            <InspectorFlushDelete
              onConfirm={handleDelete}
              onDeleted={onClose}
              label="Delete carton"
              confirmLabel="Click again to delete carton"
              data-testid="history-triage-delete"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          </InspectorActionFloor>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}
