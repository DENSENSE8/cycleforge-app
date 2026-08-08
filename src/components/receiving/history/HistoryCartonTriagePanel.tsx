'use client';

/**
 * Unbox History left-click triage inspector — Desk-family RightRailHost card
 * (`detail:history`, non-modal **push**). Read + Display tabs + one primary CTA;
 * full station work stays on LineEditPanel (double-click / Open in Unbox).
 * Mutually exclusive with LineEditPanel / UnboxPushColumn — opening the
 * workspace closes this rail.
 *
 * Header hierarchy (three fixed rows + optional View strip):
 *   1. `[→|] ………………………………… [↑ · ↓]` — navigation only
 *   2. `[Details | Logistics | Evidence | History] …… [View]` — Display tabs
 *   2b. View topics cluster when toggled (forced open in View-only shell)
 *   3. status + short PO / Receiving identity + ONE primary CTA + More
 * Topic tabs live ONLY on this push inspector — never on Unbox History Band 3.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  PackageOpen,
  Search,
  SlidersHorizontal,
} from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import {
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
  getDetailInspectorCollapsed,
  type DetailInspectorCollapseDetail,
} from '@/design-system/shells/detail-stack';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import {
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
  PaneHeaderTabs,
} from '@/components/ui/pane-header';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { ReceivingPhotosSection } from '@/components/station/receiving/ReceivingPhotosSection';
import { ReceivingAuditPanel } from '@/components/receiving/workspace/ReceivingAuditPanel';
import { HistoryViewTopicsCluster } from '@/components/receiving/history/HistoryViewTopicsCluster';
import {
  HistoryViewChromeBridge,
  useHistoryViewChromeOptional,
} from '@/components/receiving/history/history-view-chrome-context';
import { Button, IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
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

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
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
  // Read here (inside the provider) — the rail body renders under RightRailHost.
  const viewChrome = useHistoryViewChromeOptional();
  const [opening, setOpening] = useState(false);
  const [activeDisplayTopic, setActiveDisplayTopic] =
    useState<HistoryInspectorDisplayTopic>('summary');
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

  const displayTabs = useMemo(
    () =>
      topicSpecs.display.map((spec) => ({
        value: spec.key as HistoryInspectorDisplayTopic,
        label: spec.tabLabel ?? spec.label,
      })),
    [topicSpecs.display],
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
    setActiveDisplayTopic(topic);
  }, []);

  // Panel-scoped hotkeys — ignore when typing in inputs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      if (key === 'Enter' && !viewOnly && primaryAction) {
        event.preventDefault();
        runPrimary();
        return;
      }

      if (!viewOnly) {
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

  const navigate = (direction: 'prev' | 'next') => {
    emitReceiving('receiving-navigate-table', direction);
  };

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
        <div className="shrink-0 border-b border-border-soft bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow
            onClose={onClose}
            onPrev={viewOnly ? undefined : () => navigate('prev')}
            onNext={viewOnly ? undefined : () => navigate('next')}
            prevTestId="history-triage-prev"
            nextTestId="history-triage-next"
          />

          {!viewOnly ? (
            <div
              className="border-t border-border-soft"
              data-testid="history-triage-topic-tabs"
            >
              {displayTabs.length > 0 ? (
                <PaneHeaderTabs
                  dense
                  tabs={displayTabs}
                  value={activeDisplayTopic}
                  onChange={selectDisplayTopic}
                  rightSlot={
                    <IconButton
                      size="xs"
                      tone="neutral"
                      ariaLabel={
                        viewTopicsOpen ? 'Hide view controls' : 'Show view controls'
                      }
                      aria-pressed={viewTopicsOpen}
                      icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                      onClick={() => setViewTopicsOpen((open) => !open)}
                      data-testid="history-triage-view-toggle"
                    />
                  }
                />
              ) : (
                <div className="flex h-9 items-center justify-end px-2">
                  <IconButton
                    size="xs"
                    tone="neutral"
                    ariaLabel={
                      viewTopicsOpen ? 'Hide view controls' : 'Show view controls'
                    }
                    aria-pressed={viewTopicsOpen}
                    icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                    onClick={() => setViewTopicsOpen((open) => !open)}
                    data-testid="history-triage-view-toggle"
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className="border-t border-border-soft"
              data-testid="history-triage-topic-tabs"
              data-history-view-only-tabs=""
            />
          )}

          {/*
            The host stays mounted so the strip does not remount on every
            toggle, but the cluster only PUBLISHES its ▦ portal target while it
            is visibly interactive (`active`). Band 3 stopped hosting the column
            trigger on 2026-08-08, so this is its only portal host: a target
            published from a hidden or parked rail would swallow ▦ into an inert
            node and suppress the card-corner fallback. The old comment here
            ("Always mount portal host so week / ▦ do not detach when
            collapsed") was the premise that broke.
          */}
          <div
            className={cn(
              'border-t border-border-soft px-2 py-1',
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

          {!viewOnly ? (
            <div
              className="flex items-start gap-2 border-t border-border-soft px-2 pb-2 pt-1"
              data-testid="history-triage-identity"
            >
              <PaneHeaderIconBadge
                Icon={PackageOpen}
                bg="bg-blue-100"
                tint="text-blue-700"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {statusLabel ? (
                    <PaneHeaderStatusPill tone="neutral">{statusLabel}</PaneHeaderStatusPill>
                  ) : null}
                  <PaneHeaderLabel
                    eyebrow={poNumber ? 'Purchase order #' : 'Carton'}
                    value={poNumber ?? `#${target!.receivingId}`}
                    valueTitle={poNumber ?? `Carton #${target!.receivingId}`}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 pt-0.5">
                {primaryAction ? (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={opening}
                    disabled={opening}
                    onClick={runPrimary}
                    data-testid="history-triage-primary-cta"
                    ariaLabel={primaryAction.label}
                  >
                    {primaryAction.label}
                  </Button>
                ) : null}
                {moreItems.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        size="xs"
                        tone="neutral"
                        ariaLabel="More actions"
                        icon={<MoreHorizontal className="h-4 w-4" />}
                        disabled={opening}
                        data-testid="history-triage-more"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {moreItems.map((item) => (
                        <DropdownMenuItem
                          key={item.key}
                          onSelect={() => runMoreItem(item.key)}
                          className="justify-between gap-4"
                        >
                          <span>{item.label}</span>
                          {item.shortcut ? (
                            <kbd className="font-mono text-role-micro text-text-faint">
                              {item.shortcut}
                            </kbd>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className="border-t border-border-soft px-3 py-2"
              data-testid="history-triage-view-only-hint"
            >
              <p className="text-role-caption text-text-soft">
                Sheet layout &amp; filters — select a row for carton details.
              </p>
            </div>
          )}
        </div>

        {!viewOnly ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
            {cartonQuery.isLoading && !carton ? (
              <SkeletonList count={4} type="row" />
            ) : (
              <>
                {activeDisplayTopic === 'summary' ? (
                  <section className="space-y-2" data-history-topic="summary">
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
                ) : null}

                {activeDisplayTopic === 'logistics' ? (
                  <section className="space-y-2" data-history-topic="logistics">
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
                      <OrderFactRow label="Channel" value={channel} omitWhenEmpty />
                      <OrderFactRow label="Price" value={price} omitWhenEmpty />
                      <OrderFactRow label="Qty" value={qtyLabel} omitWhenEmpty />
                      <OrderFactRow label="Location" value={location} omitWhenEmpty />
                    </OrderFactList>
                  </section>
                ) : null}

                {activeDisplayTopic === 'photos' ? (
                  <section className="space-y-2" data-history-topic="photos">
                    <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                      Photo evidence
                    </h3>
                    <ReceivingPhotosSection
                      receivingId={String(target!.receivingId)}
                      poRef={poNumber}
                      readOnly
                      hideHeader
                      launcherTitle="Scan bench photos"
                    />
                  </section>
                ) : null}

                {activeDisplayTopic === 'audit' && target ? (
                  <section className="space-y-2" data-history-topic="audit">
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
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}
