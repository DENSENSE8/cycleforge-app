'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ImagePlus,
  MapPin,
  Package,
  PackageCheck,
  SlidersHorizontal,
  User,
} from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button, IconButton } from '@/design-system/primitives';
import { useToShipOrders } from '@/components/mobile/redesign/useToShipOrders';
import { EMPTY_META_DASH } from '@/lib/conditions';
import {
  ALLOCATE_SORTS,
  parseAllocateDensity,
  parseAllocateSort,
  sortAllocateRows,
  type AllocateDensity,
  type AllocateSort,
} from '@/lib/mobile/allocate-list-state';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { usePressHaptic } from '@/lib/scan-feedback/useScanFeedback';
import {
  filterToShipByOrderView,
  MOBILE_ALLOCATE_STATUS_VIEWS,
  type MobileAllocateStatusView,
} from '@/lib/work-orders/to-ship-assignment';
import { resolveOutboundWorkflowFacts } from '@/lib/shipping/outbound-workflow-facts';
import { resolveAllocatePresentation } from '@/lib/work-orders/allocate-presentation';
import { cn } from '@/utils/_cn';
import { useMobileV2Search } from '../MobileV2SearchContext';

type VisibleOrderView = MobileAllocateStatusView;
type FulfillmentOrder = ReturnType<typeof useToShipOrders>['rows'][number];

const ORDER_VIEWS = MOBILE_ALLOCATE_STATUS_VIEWS;

const LONG_PRESS_MS = 525;
const GESTURE_SLOP_PX = 10;
const SWIPE_REVEAL_PX = 48;
const PAGE_SIZE = 50;
const ALLOCATE_STATE_KEY = 'cycleforge:mobile-v2:allocate-state';

type AllocateTemporalEvent = 'order_arrived' | 'remote_changed' | 'deadline_escalated' | 'scan_matched';

interface StoredAllocateState {
  view?: string;
  sort?: string;
  density?: string;
  page?: number;
  scrollTop?: number;
}

function readStoredAllocateState(): StoredAllocateState {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(ALLOCATE_STATE_KEY) || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? parsed as StoredAllocateState : {};
  } catch {
    return {};
  }
}

function parseOrderView(value: string | null | undefined): VisibleOrderView {
  return ORDER_VIEWS.some((option) => option.id === value) ? value as VisibleOrderView : 'all';
}

function OrderPhoto({ row, density }: { row: FulfillmentOrder; density: AllocateDensity }) {
  const sizeClass = density === 'comfortable' ? 'h-14 w-14' : 'h-11 w-11';
  return row.imageUrl ? (
    // Remote marketplace media has unbounded hosts. Fixed dimensions prevent
    // layout shift in this dense operational row.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={row.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn(sizeClass, 'shrink-0 rounded-md bg-surface-sunken object-cover')}
    />
  ) : (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-faint', sizeClass)}
    >
      <Package className="h-5 w-5" />
    </span>
  );
}

function StatusIcon({ stage, label, className }: { stage: string; label: string; className: string }) {
  const icon = stage === 'BLOCKED'
    ? <AlertTriangle className="h-3.5 w-3.5" />
    : stage === 'PICKED'
      ? <PackageCheck className="h-3.5 w-3.5" />
      : stage === 'PACKED_STAGED'
        ? <Box className="h-3.5 w-3.5" />
        : <Clock className="h-3.5 w-3.5" />;
  return (
    <span
      title={label}
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 ring-0',
        className,
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function temporalEventClass(event: AllocateTemporalEvent | undefined): string | false {
  if (event === 'deadline_escalated') return 'ring-2 ring-inset ring-border-danger';
  if (event === 'order_arrived') return 'ring-2 ring-inset ring-border-success';
  if (event === 'remote_changed') return 'ring-2 ring-inset ring-border-warning';
  if (event === 'scan_matched') return 'ring-2 ring-inset ring-border-accent';
  return false;
}

function FulfillmentOrderRow({
  row,
  selected,
  selectionMode,
  onToggleSelection,
  onOpenDetails,
  onLongPressHaptic,
  onSeen,
  density,
  nowMs,
  temporalEvent,
}: {
  row: FulfillmentOrder;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelection: () => void;
  onOpenDetails: () => void;
  onLongPressHaptic: () => void;
  onSeen: () => void;
  density: AllocateDensity;
  nowMs: number;
  temporalEvent?: AllocateTemporalEvent;
}) {
  const [reveal, setReveal] = useState<'none' | 'actions' | 'more'>('none');
  const gesture = useRef({ x: 0, y: 0, longPressed: false });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const model = resolveAllocatePresentation(row, nowMs);
  const { workflow, state } = model;
  const platform = sourcePlatformMetaFromLabel(row.accountSource);
  const facts = [model.quantityDisplay, model.condition, model.price]
    .filter((value) => value !== EMPTY_META_DASH)
    .join(' · ');
  const pickHref = model.processHref;
  const railClass = workflow.blocked
    ? 'border-l-2 border-border-danger'
    : workflow.stateRail === 'packed'
      ? 'border-l-2 border-border-success'
      : workflow.deadlineBand === 'overdue'
        ? 'border-l-2 border-border-danger'
        : workflow.deadlineBand === 'today'
          ? 'border-l-2 border-border-warning'
          : 'border-l-2 border-border-accent';

  const clearTimer = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a,button')) return;
    onSeen();
    gesture.current = { x: event.clientX, y: event.clientY, longPressed: false };
    clearTimer();
    longPressTimer.current = setTimeout(() => {
      gesture.current.longPressed = true;
      setReveal('none');
      onToggleSelection();
      onLongPressHaptic();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const deltaX = event.clientX - gesture.current.x;
    const deltaY = event.clientY - gesture.current.y;
    if (Math.abs(deltaX) > GESTURE_SLOP_PX || Math.abs(deltaY) > GESTURE_SLOP_PX) clearTimer();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    clearTimer();
    if (gesture.current.longPressed || (event.target as HTMLElement).closest('a,button')) return;
    const deltaX = event.clientX - gesture.current.x;
    const deltaY = event.clientY - gesture.current.y;
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX <= -SWIPE_REVEAL_PX) {
      setReveal('actions');
      return;
    }
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX >= SWIPE_REVEAL_PX) {
      setReveal('more');
      return;
    }
    if (Math.abs(deltaX) <= GESTURE_SLOP_PX && Math.abs(deltaY) <= GESTURE_SLOP_PX) {
      if (selectionMode) onToggleSelection();
      else if (reveal !== 'none') setReveal('none');
      else onOpenDetails();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (selectionMode) onToggleSelection();
    else onOpenDetails();
  };

  return (
    <li
      className={cn(
        'relative overflow-hidden border-b border-border-soft bg-surface-card',
        railClass,
        temporalEventClass(temporalEvent),
      )}
      data-testid="mobile-v2-order-row"
      data-order-row-id={row.id}
      data-temporal-event={temporalEvent}
    >
      <div className="absolute inset-y-0 left-0 flex w-16" aria-hidden={reveal !== 'more'}>
        <button
          type="button"
          onClick={onOpenDetails}
          tabIndex={reveal === 'more' ? 0 : -1}
          className="flex flex-1 items-center justify-center bg-surface-strong text-xs font-semibold text-text-default"
        >
          More
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-16" aria-hidden={reveal !== 'actions'}>
        <Link
          href={pickHref}
          tabIndex={reveal === 'actions' ? 0 : -1}
          className="flex flex-1 items-center justify-center bg-action-primary text-xs font-semibold text-action-primary-foreground"
        >
          Pick
        </Link>
      </div>

      <div
        role="link"
        tabIndex={0}
        aria-label={`Open order from ${platform.label}: ${row.title}`}
        aria-selected={selected || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={clearTimer}
        onPointerLeave={clearTimer}
        onKeyDown={onKeyDown}
        className={cn(
          'relative z-content flex min-w-0 select-none touch-pan-y bg-surface-card transition-transform duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent',
          selected && 'bg-surface-selected',
          reveal === 'actions' && '-translate-x-16',
          reveal === 'more' && 'translate-x-16',
        )}
      >
        <div className="hidden w-10 shrink-0 items-center justify-center border-r border-border-soft md:flex">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onToggleSelection(); }}
            aria-label={`${selected ? 'Deselect' : 'Select'} ${row.title}`}
            aria-pressed={selected}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              selected
                ? 'border-border-accent bg-action-primary text-action-primary-foreground'
                : 'border-border-default bg-surface-card text-transparent',
            )}
          >
            <Check className="h-4 w-4" />
          </button>
        </div>

        <div className={cn('min-w-0 flex-1 px-2.5', density === 'comfortable' ? 'py-3' : 'py-1')}>
          <div className="flex min-w-0 items-center gap-1">
            <StatusIcon stage={workflow.stage} label={state.label} className={state.pill} />
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onOpenDetails(); }}
              className="flex shrink-0 items-center rounded-md pr-1.5 text-left text-[11px] font-semibold text-text-default hover:bg-surface-hover"
              aria-label={`Order details for ${platform.label} order ${model.orderReference}`}
            >
              <PlatformMark meta={platform} />
              <span>{platform.label}</span>
            </button>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium tabular-nums text-text-muted">
              #{model.orderReference.replace(/^#/, '')}
            </span>
            <span
              className={cn(
                'shrink-0 text-[11px] font-semibold tabular-nums',
                workflow.deadlineBand === 'overdue'
                  ? 'text-text-danger'
                  : workflow.deadlineBand === 'today'
                    ? 'text-text-warning'
                    : 'text-text-muted',
              )}
            >
              {model.sla}
            </span>
          </div>

          <div className={cn('flex min-w-0 gap-2', density === 'comfortable' ? 'mt-1' : 'mt-0.5')}>
            <OrderPhoto row={row} density={density} />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <h2 className="line-clamp-2 text-[13px] font-semibold leading-4 text-text-default">{row.title}</h2>
              <div className="flex min-w-0 items-center gap-2 text-[11px] leading-4">
                <div
                  title={facts}
                  className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-medium tabular-nums text-text-muted"
                >
                  {model.quantityDisplay !== EMPTY_META_DASH ? (
                    <span className={cn('shrink-0', (model.quantity ?? 0) > 1 && 'font-bold', model.quantityTone)}>
                      {model.quantityDisplay}
                    </span>
                  ) : null}
                  {model.condition !== EMPTY_META_DASH ? (
                    <>
                      <span aria-hidden className="shrink-0 text-text-faint">·</span>
                      <span className={cn('shrink-0 font-semibold', model.conditionTone)}>{model.condition}</span>
                    </>
                  ) : null}
                  {model.price !== EMPTY_META_DASH ? (
                    <>
                      <span aria-hidden className="shrink-0 text-text-faint">·</span>
                      <span className="shrink-0 font-semibold text-text-success">{model.price}</span>
                    </>
                  ) : null}
                </div>
                <span className="shrink-0 font-semibold text-text-default">
                  {workflow.nextStep.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function AllocateDetailSheet({
  row,
  nowMs,
  onOpenChange,
}: {
  row: FulfillmentOrder | null;
  nowMs: number;
  onOpenChange: (open: boolean) => void;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!row) return null;
  const model = resolveAllocatePresentation(row, nowMs);
  const platform = sourcePlatformMetaFromLabel(row.accountSource);
  const listingPlatform = model.listingPlatform || platform.label;
  const stockFacts = [
    { label: 'Needed', value: model.quantityDisplay },
    { label: 'Available', value: model.available == null ? EMPTY_META_DASH : String(model.available) },
    { label: 'Allocated', value: model.allocated == null ? EMPTY_META_DASH : String(model.allocated) },
    { label: 'Picked', value: model.picked == null ? EMPTY_META_DASH : String(model.picked) },
  ];
  const pairHref = row.sku?.trim()
    ? `/m/scan?intent=location&pairSku=${encodeURIComponent(row.sku.trim())}&returnTo=${encodeURIComponent('/m/orders')}`
    : null;

  return (
    <>
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col rounded-t-2xl p-0">
          <SheetHeader className="sticky top-0 z-content border-b border-border-soft bg-surface-card px-4 pb-3 pr-12 pt-4">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="flex min-w-0 items-center gap-1.5 text-text-default">
                <PlatformMark meta={platform} />
                {platform.label}
                <span className="truncate font-normal tabular-nums text-text-muted">#{model.orderReference.replace(/^#/, '')}</span>
              </span>
              <span className={cn(
                'shrink-0 tabular-nums',
                model.workflow.deadlineBand === 'overdue' ? 'text-text-danger' : model.workflow.deadlineBand === 'today' ? 'text-text-warning' : 'text-text-muted',
              )}>
                {model.sla}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <StatusIcon stage={model.workflow.stage} label={model.state.label} className={model.state.pill} />
              <SheetTitle className="line-clamp-2 text-left text-base">{row.title}</SheetTitle>
            </div>
            <SheetDescription className="sr-only">Allocate details and the next safe warehouse action.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => row.imageUrl && setPhotoOpen(true)}
                disabled={!row.imageUrl}
                className="relative shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default"
                aria-label={row.imageUrl ? 'View product photo full screen' : 'No product photo'}
              >
                <OrderPhoto row={row} density="comfortable" />
                {row.imageUrl ? <span className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1 py-0.5 text-[9px] font-bold text-white">View</span> : null}
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold tabular-nums">
                  {model.quantityDisplay !== EMPTY_META_DASH ? <span className={model.quantityTone}>{model.quantityDisplay}</span> : null}
                  {model.condition !== EMPTY_META_DASH ? <span className={model.conditionTone}>{model.condition}</span> : null}
                  {model.price !== EMPTY_META_DASH ? <span className="text-text-success">{model.price}</span> : null}
                </p>
                <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-text-default">
                  <MapPin className="h-4 w-4 shrink-0 text-text-muted" />
                  {model.location ?? 'Location not assigned'}
                </p>
                <p className="mt-1 text-xs text-text-muted">Next: {model.workflow.nextStep.label}</p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-4 divide-x divide-border-soft overflow-hidden rounded-xl border border-border-soft bg-surface-sunken">
              {stockFacts.map((fact) => (
                <div key={fact.label} className="min-w-0 px-2 py-2 text-center">
                  <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-text-faint">{fact.label}</dt>
                  <dd className="mt-0.5 text-sm font-bold tabular-nums text-text-default">{fact.value}</dd>
                </div>
              ))}
            </dl>

            <section className="mt-4 space-y-2" aria-label="Location actions">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">Location</p>
              <Button href={model.processHref} variant="secondary" size="lg" radius="surface" icon={<MapPin />} className="w-full justify-start">
                {model.location ? 'Verify or change pick location' : 'Assign pick location'}
              </Button>
              {pairHref ? (
                <Button href={pairHref} variant="secondary" size="lg" radius="surface" className="w-full justify-start">
                  Pair SKU to a home location
                </Button>
              ) : null}
            </section>

            <section className="mt-4 space-y-2" aria-label="Order ownership">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">Ownership</p>
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border-soft px-3 text-sm text-text-default">
                <User className="h-4 w-4 text-text-muted" />
                <span>{model.picker ? `Picker: ${model.picker}` : 'Picker unassigned'}</span>
                {model.packer ? <span className="ml-auto text-text-muted">Packer: {model.packer}</span> : null}
              </div>
            </section>

            <section className="mt-4 space-y-2" aria-label="Listing and media">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">Listing and media</p>
              {row.imageUrl ? (
                <Button variant="secondary" size="lg" radius="surface" icon={<ImagePlus />} className="w-full justify-start" onClick={() => setPhotoOpen(true)}>
                  View photo
                </Button>
              ) : null}
              {model.listingUrl ? (
                <Button href={model.listingUrl} variant="secondary" size="lg" radius="surface" icon={<ExternalLink />} className="w-full justify-start">
                  Open listing in {listingPlatform}
                </Button>
              ) : (
                <p className="rounded-xl bg-surface-sunken p-3 text-sm text-text-muted">No preferred marketplace link is stored.</p>
              )}
              {row.itemNumber?.trim() ? <p className="break-all px-1 font-mono text-xs text-text-muted">{row.itemNumber}</p> : null}
            </section>
          </div>

          <SheetFooter className="sticky bottom-0 border-t border-border-soft bg-surface-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <Button href={model.primary.href} variant="primary" size="lg" radius="surface" className="w-full">{model.primary.label}</Button>
            <Button href={model.fullRecordHref} variant="ghost" size="lg" radius="surface" className="w-full">Full order record</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={photoOpen} onOpenChange={setPhotoOpen}>
        <SheetContent side="bottom" className="flex h-[100dvh] max-h-[100dvh] flex-col bg-black p-0">
          <SheetHeader className="sr-only"><SheetTitle>{row.title} photo</SheetTitle></SheetHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            {row.imageUrl ? <img src={row.imageUrl} alt={row.title} className="max-h-full max-w-full object-contain" /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function MobileV2FulfillmentOrders() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pressHaptic = usePressHaptic();
  const { query } = useMobileV2Search();
  const scanQuery = searchParams.get('scan')?.trim() ?? '';
  const [initialState] = useState(readStoredAllocateState);
  const [view, setView] = useState<VisibleOrderView>(() => parseOrderView(initialState.view));
  const [sort, setSort] = useState<AllocateSort>(() => parseAllocateSort(initialState.sort));
  const [density, setDensity] = useState<AllocateDensity>(() => parseAllocateDensity(initialState.density));
  const [page, setPage] = useState(() => Number.isInteger(initialState.page) && Number(initialState.page) >= 0 ? Number(initialState.page) : 0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailRow, setDetailRow] = useState<FulfillmentOrder | null>(null);
  const [temporalEvents, setTemporalEvents] = useState<Map<string, AllocateTemporalEvent>>(() => new Map());
  const [incomingIds, setIncomingIds] = useState<Set<string>>(() => new Set());
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => new Set());
  const [changedCounts, setChangedCounts] = useState<Set<VisibleOrderView>>(() => new Set());
  const [scrollIndex, setScrollIndex] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sectionRef = useRef<HTMLElement>(null);
  const previousRowsRef = useRef(new Map<string, FulfillmentOrder>());
  const previousCountsRef = useRef(new Map<VisibleOrderView, number>());
  const previousDeadlineBandsRef = useRef(new Map<string, string>());
  const interactionOrderRef = useRef<string[]>([]);
  const handledScanRef = useRef('');
  const { rows, isPending, isError } = useToShipOrders({
    enabled: true,
    searchQuery: scanQuery || query,
  });
  const filteredRows = useMemo(() => filterToShipByOrderView(rows, view), [rows, view]);
  const sortedRows = useMemo(() => sortAllocateRows(filteredRows, sort), [filteredRows, sort]);
  const selectionMode = selectedIds.size > 0;
  const visibleRows = useMemo(() => {
    if (!selectionMode || interactionOrderRef.current.length === 0) return sortedRows;
    const rank = new Map(interactionOrderRef.current.map((id, index) => [id, index]));
    return [...sortedRows].sort((a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }, [selectionMode, sortedRows]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = visibleRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const incomingCount = incomingIds.size;
  const viewCounts = useMemo(() => new Map(
    ORDER_VIEWS.map((option) => [option.id, filterToShipByOrderView(rows, option.id).length] as const),
  ), [rows]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previous = previousRowsRef.current;
    const next = new Map(rows.map((row) => [row.id, row]));
    if (previous.size > 0) {
      const arrived = rows.filter((row) => !previous.has(row.id));
      const changed = rows.filter((row) => previous.has(row.id) && previous.get(row.id) !== row);
      if (arrived.length > 0 || changed.length > 0) {
        setTemporalEvents((current) => {
          const updated = new Map(current);
          for (const row of arrived) updated.set(row.id, 'order_arrived');
          for (const row of changed) if (!updated.has(row.id)) updated.set(row.id, 'remote_changed');
          return updated;
        });
      }
      if (arrived.length > 0) {
        setIncomingIds((current) => new Set([...current, ...arrived.map((row) => row.id)]));
      }
    }
    previousRowsRef.current = next;
  }, [rows]);

  useEffect(() => {
    const previous = previousDeadlineBandsRef.current;
    const next = new Map<string, string>();
    const escalated: string[] = [];
    for (const row of rows) {
      const band = resolveOutboundWorkflowFacts({
        shipmentId: row.shipmentId,
        fulfillmentChannel: row.fulfillmentChannel,
        hasPickScan: row.hasPickScan,
        packedAt: row.packedAt,
        dockStagedAt: row.dockStagedAt,
        isOutOfStock: row.outOfStock,
        deadlineAt: row.deadlineAt,
      }).deadlineBand;
      next.set(row.id, band);
      const earlier = previous.get(row.id);
      if (earlier && earlier !== band && (band === 'today' || band === 'overdue')) escalated.push(row.id);
    }
    if (escalated.length > 0) {
      setTemporalEvents((current) => {
        const updated = new Map(current);
        for (const id of escalated) updated.set(id, 'deadline_escalated');
        return updated;
      });
    }
    previousDeadlineBandsRef.current = next;
  }, [nowMs, rows]);

  useEffect(() => {
    if (!scanQuery || isPending || handledScanRef.current === scanQuery) return;
    handledScanRef.current = scanQuery;
    const match = rows[0];
    if (!match) return;
    const matchingView = ORDER_VIEWS.find(
      (option) => filterToShipByOrderView([match], option.id).length > 0,
    );
    setView(matchingView?.id ?? 'to-pick');
    setPage(0);
    setTemporalEvents((current) => new Map(current).set(match.id, 'scan_matched'));
    const frame = window.requestAnimationFrame(() => {
      sectionRef.current
        ?.querySelector<HTMLElement>(`[data-order-row-id="${CSS.escape(match.id)}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPending, rows, scanQuery]);

  useEffect(() => {
    const previous = previousCountsRef.current;
    if (previous.size > 0) {
      const changed = ORDER_VIEWS
        .filter((option) => previous.get(option.id) !== viewCounts.get(option.id))
        .map((option) => option.id);
      if (changed.length > 0) setChangedCounts((current) => new Set([...current, ...changed]));
    }
    previousCountsRef.current = viewCounts;
  }, [viewCounts]);

  useEffect(() => {
    const current = readStoredAllocateState();
    window.sessionStorage.setItem(ALLOCATE_STATE_KEY, JSON.stringify({
      ...current,
      view,
      sort,
      density,
      page: safePage,
    } satisfies StoredAllocateState));
  }, [density, safePage, sort, view]);

  useEffect(() => {
    const host = sectionRef.current?.closest('main');
    if (!host) return;
    const stored = readStoredAllocateState();
    const restore = window.requestAnimationFrame(() => {
      if (typeof stored.scrollTop === 'number') host.scrollTop = stored.scrollTop;
    });
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rowsOnPage = [...sectionRef.current?.querySelectorAll<HTMLElement>('[data-testid="mobile-v2-order-row"]') ?? []];
        const boundary = host.getBoundingClientRect().top + 44;
        const firstVisible = rowsOnPage.findIndex((row) => row.getBoundingClientRect().bottom > boundary);
        setScrollIndex(firstVisible >= 0 ? safePage * PAGE_SIZE + firstVisible + 1 : 1);
        const current = readStoredAllocateState();
        window.sessionStorage.setItem(ALLOCATE_STATE_KEY, JSON.stringify({ ...current, scrollTop: host.scrollTop } satisfies StoredAllocateState));
      });
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(restore);
      window.cancelAnimationFrame(frame);
      host.removeEventListener('scroll', onScroll);
    };
  }, [safePage]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else {
        if (current.size === 0) interactionOrderRef.current = visibleRows.map((row) => row.id);
        next.add(id);
      }
      if (next.size === 0) interactionOrderRef.current = [];
      return next;
    });
  };

  const onlySelected = selectedIds.size === 1
    ? rows.find((row) => selectedIds.has(row.id)) ?? null
    : null;

  const markSeen = (id: string) => {
    setTemporalEvents((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    setIncomingIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setAcknowledgedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const acknowledgeNewOrders = () => {
    setAcknowledgedIds(new Set(incomingIds));
    setIncomingIds(new Set());
    sectionRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section ref={sectionRef} className="flex min-h-full w-full flex-col bg-surface-canvas md:max-w-[36rem] md:border-r md:border-border-soft" aria-label="Fulfillment orders">
      <div className="sticky top-0 z-content border-b border-border-soft bg-surface-card/95 backdrop-blur-xl">
        {scanQuery ? (
          <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border-accent bg-surface-accent px-3 py-1.5 text-xs text-text-accent">
            <span className="min-w-0 truncate font-bold">
              {isPending ? 'Finding scan…' : rows.length > 0 ? `Scan match · ${scanQuery}` : `No Allocate match · ${scanQuery}`}
            </span>
            <button
              type="button"
              onClick={() => router.replace('/m/orders')}
              className="shrink-0 rounded-full border border-border-accent px-2 py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              Clear
            </button>
          </div>
        ) : null}
        {incomingCount > 0 ? (
          <button
            type="button"
            onClick={acknowledgeNewOrders}
            className="flex h-9 w-full items-center justify-center gap-1.5 border-b border-border-accent bg-surface-accent text-xs font-bold text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            {incomingCount} new {incomingCount === 1 ? 'order' : 'orders'}
          </button>
        ) : null}
        <nav className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter fulfillment orders">
          {ORDER_VIEWS.map((option) => {
            const active = view === option.id;
            const count = viewCounts.get(option.id) ?? 0;
            const changed = changedCounts.has(option.id);
            return (
              <Button
                key={option.id}
                size="sm"
                radius="pill"
                variant={active ? 'primary' : 'secondary'}
                onClick={() => {
                  setView(option.id);
                  setPage(0);
                  setChangedCounts((current) => {
                    const next = new Set(current);
                    next.delete(option.id);
                    return next;
                  });
                }}
                aria-pressed={active}
                className={cn('shrink-0', changed && !active && 'ring-2 ring-border-warning')}
              >
                {option.label}{' '}
                <span data-count-changed={changed || undefined} className={cn('tabular-nums opacity-70', changed && 'font-bold opacity-100')}>
                  {count}
                </span>
              </Button>
            );
          })}
          <label className="relative flex h-8 shrink-0 items-center gap-1 rounded-full border border-border-soft bg-surface-card pl-2 pr-1 text-xs font-semibold text-text-default">
            <SlidersHorizontal className="h-3.5 w-3.5 text-text-soft" aria-hidden />
            <span className="sr-only">Sort Allocate orders</span>
            <select
              value={sort}
              onChange={(event) => { setSort(parseAllocateSort(event.target.value)); setPage(0); }}
              className="h-full appearance-none bg-transparent pr-4 text-xs font-semibold outline-none"
              aria-label="Sort Allocate orders"
            >
              {ALLOCATE_SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-text-muted" aria-hidden />
          </label>
          <IconButton
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            ariaLabel={density === 'high' ? 'Use comfortable row density' : 'Use high-volume row density'}
            title={density === 'high' ? 'High-volume density' : 'Comfortable density'}
            size="md"
            radius="pill"
            onClick={() => setDensity((current) => current === 'high' ? 'comfortable' : 'high')}
            className={cn('border border-border-soft bg-surface-card', density === 'high' && 'text-text-accent')}
          />
        </nav>
      </div>

      {isPending ? (
        <div className="divide-y divide-border-soft border-y border-border-soft" aria-label="Loading fulfillment orders">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-24 bg-surface-strong" />)}
        </div>
      ) : isError ? (
        <div className="mx-3 rounded-2xl border border-border-danger bg-surface-danger p-5 text-center">
          <p className="text-sm font-semibold text-text-danger">Orders could not be loaded.</p>
          <p className="mt-1 text-xs text-text-danger">Check the connection and try again.</p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="mx-3 rounded-2xl border border-border-soft bg-surface-card p-6 text-center">
          <p className="text-sm font-semibold text-text-default">No matching orders</p>
          <p className="mt-1 text-xs text-text-muted">Change the filter or clear the search.</p>
        </div>
      ) : (
        <ul className="border-y border-border-soft">
          {pagedRows.map((row, index) => {
            const firstAcknowledged = acknowledgedIds.has(row.id)
              && (index === 0 || !acknowledgedIds.has(pagedRows[index - 1].id));
            return (
              <Fragment key={row.id}>
                {firstAcknowledged ? (
                  <li className="border-b border-border-accent bg-surface-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-text-accent">
                    New since you last checked
                  </li>
                ) : null}
                <FulfillmentOrderRow
                  row={row}
                  selected={selectedIds.has(row.id)}
                  selectionMode={selectionMode}
                  onToggleSelection={() => toggleSelected(row.id)}
                  onOpenDetails={() => setDetailRow(row)}
                  onLongPressHaptic={pressHaptic}
                  onSeen={() => markSeen(row.id)}
                  density={density}
                  nowMs={nowMs}
                  temporalEvent={temporalEvents.get(row.id)}
                />
              </Fragment>
            );
          })}
        </ul>
      )}

      {scrollIndex > 1 && visibleRows.length > 0 ? (
        <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-2 z-header rounded-full border border-border-soft bg-surface-card/95 px-2.5 py-1 text-[11px] font-bold tabular-nums text-text-muted shadow-sm backdrop-blur-xl">
          {ORDER_VIEWS.find((option) => option.id === view)?.label ?? 'Allocate'} · {Math.min(scrollIndex, visibleRows.length)} of {visibleRows.length}
        </div>
      ) : null}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between border-b border-border-soft bg-surface-card px-3 py-2" aria-label="Fulfillment pages">
          <IconButton
            icon={<ChevronLeft className="h-4 w-4" />}
            ariaLabel="Previous fulfillment page"
            size="touch"
            radius="surface"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="border border-border-soft bg-surface-card"
          />
          <span className="text-xs font-semibold tabular-nums text-text-muted">
            Page {safePage + 1} of {pageCount}
          </span>
          <IconButton
            icon={<ChevronRight className="h-4 w-4" />}
            ariaLabel="Next fulfillment page"
            size="touch"
            radius="surface"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            className="border border-border-soft bg-surface-card"
          />
        </nav>
      ) : null}

      {selectionMode ? (
        <div className="sticky bottom-0 z-header mt-auto flex min-h-14 items-center justify-between gap-3 border-t border-border-soft bg-surface-card/95 px-3 py-2 backdrop-blur-xl">
          <span className="text-sm font-semibold text-text-default">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              radius="surface"
              variant="ghost"
              onClick={() => {
                interactionOrderRef.current = [];
                setSelectedIds(new Set());
              }}
            >
              Clear
            </Button>
            {onlySelected ? <Button size="sm" radius="surface" variant="primary" onClick={() => router.push(`/m/orders/${onlySelected.entityId}`)}>Open</Button> : null}
          </div>
        </div>
      ) : null}

      <AllocateDetailSheet row={detailRow} nowMs={nowMs} onOpenChange={(open) => { if (!open) setDetailRow(null); }} />
    </section>
  );
}
