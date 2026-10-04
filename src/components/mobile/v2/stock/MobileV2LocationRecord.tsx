'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, MapPin, Package, Plus, Printer, ScanBarcode } from '@/components/Icons';
import { LocationStockPositions } from '@/components/mobile/location/LocationStockPositions';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { fetchLocationRecord, locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationHandlingUnit, LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { InboundPickerRow } from '@/components/mobile/v2/inbound/MobileV2InboundParts';
import { MobileV2AdoptBaySheet } from '@/components/mobile/v2/racks/MobileV2AdoptBaySheet';
import { MobileV2RackRecord } from '@/components/mobile/v2/racks/MobileV2RackRecord';
import { rackErrorSentence } from '@/components/mobile/v2/racks/rack-presentation';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button, IconButton, SearchField } from '@/design-system/primitives';
import { DetailDock } from '@/design-system/components/DetailDock';
import { PathChips } from '@/design-system/components/PathChips';
import { motionTransitionMobile } from '@/design-system/foundations/motion-presets';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from '@/design-system/motion';
import { BAY_SIDE_FACE, locationCode, noPad, pad2, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { stockDrillHref, stockDrillSideOf } from '@/lib/inventory/stock-drill';
import { parseRackCode, rackLevel } from '@/lib/locations/rack-code';
import { rackPlacementText } from '@/lib/locations/rack-display';
import { editRackShelves, getRack, rackQueryKey, RackRequestError } from '@/lib/locations/racks-client';
import { handlingUnitQcFace } from '@/lib/handling-unit-presentation';
import type { StockTote } from '@/lib/inventory/stock-places';
import { printHandlingUnitLabel } from '@/lib/print/printHandlingUnitLabel';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { containerPath, locationLabelsHref } from '@/lib/nav/route-tree';
import { useAuth } from '@/contexts/AuthContext';
import { useArrivalShelfTiers } from '@/lib/receiving/arrival-shelves-client';
import { LocationUrgencyFact, LocationUrgencySheet } from './LocationArrivalUrgency';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { locationLabelPrintSummary } from '@/lib/print/printLocationRows';
import { MobileV2LocationPicker, rememberLocationVisit } from './MobileV2LocationPicker';

/*
 * The lateral walk: a horizontal drag moves the whole page with the finger,
 * the neighbour's code peeks in from that side, and a release past the
 * threshold (or a flick) commits to the neighbour; anything less springs back.
 * The visible way to a sibling is the title's ordinal picker — the swipe only
 * speeds it up (F9), so it never starts in the OS's edge gutters.
 */
/** px from either screen edge that belong to the OS back / system gestures (F9). */
const WALK_EDGE_GUTTER = 24;
/** px of travel before a touch is read as horizontal (walk) or vertical (scroll). */
const WALK_AXIS_LOCK = 10;
/** Fraction of the page width a slow drag must travel to commit. */
const WALK_COMMIT_FRACTION = 0.28;
/** px/s — a flick commits regardless of travel. */
const WALK_FLICK_VELOCITY = 500;
/** Drag damping toward a side with no neighbour (first / last of the room). */
const WALK_EDGE_RESISTANCE = 0.25;
/** Width of the neighbour peek card — must match its `w-40`. */
const WALK_PEEK_WIDTH = 160;
/** Touches that start on a control, a horizontal strip, or a sheet are not walks. */
const WALK_IGNORE = 'button, a, input, textarea, select, label, nav, [role="slider"], [role="dialog"]';

/**
 * Set by a committed swipe, read by the arriving record so it slides in from
 * the side the finger pushed toward. Short-lived and keyed to the target, so a
 * later visit to the same code by another path does not replay it.
 */
let walkArrival: { code: string; from: 1 | -1; at: number } | null = null;
const WALK_ARRIVAL_TTL_MS = 4000;

type Filter = 'all' | 'lpn' | 'loose' | 'hold';

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'lpn', label: 'Totes' },
  { id: 'loose', label: 'Loose' },
  { id: 'hold', label: 'Hold' },
];

const TONE: Record<ReturnType<typeof handlingUnitQcFace>['tone'], string> = {
  neutral: 'bg-text-faint',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
};

function LpnRow({ unit, onOpen }: { unit: LocationHandlingUnit; onOpen: () => void }) {
  const face = handlingUnitQcFace(unit);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid min-h-14 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-mode-rule bg-mode-panel px-mode-page py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
      data-testid="location-lpn-row"
    >
      <span className={cn('h-2.5 w-2.5 justify-self-center rounded-full', TONE[face.tone])} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-mono text-sm font-semibold text-mode-ink">{unit.code}</span>
        <span className="block truncate text-[11px] leading-4 text-mode-muted">{face.label}</span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-bold tabular-nums text-mode-ink">{unit.totalUnits}</span>
        <span className={cn('block text-[10px] font-semibold', face.tone === 'danger' ? 'text-rose-600' : 'text-mode-muted')}>
          {unit.pairedOrderId ? 'Allocated' : face.next}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-mode-muted" />
    </button>
  );
}

function ParkToteSheet({
  open,
  onOpenChange,
  record,
  verificationToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: LocationRecord;
  verificationToken: string | null;
}) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totes = useQuery<StockTote[]>({
    queryKey: ['stock-places', 'totes'],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch('/api/stock-places', { credentials: 'include', cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as { totes?: StockTote[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || 'Could not load totes');
      return body?.totes ?? [];
    },
  });
  const selectedTote = (totes.data ?? []).find((tote) => tote.id === choice) ?? null;
  const visibleTotes = (totes.data ?? []).filter((tote) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return tote.code.toLowerCase().includes(needle)
      || (tote.physicalLocationName?.toLowerCase().includes(needle) ?? false);
  });
  const totePlace = (tote: StockTote) => tote.physicalLocationId === record.id
    ? 'Already here'
    : tote.physicalLocationName
      ? `At ${tote.physicalLocationName}`
      : 'Not parked';
  const changeOpen = (next: boolean) => {
    if (!next) {
      setChoosing(false);
      setQuery('');
    }
    onOpenChange(next);
  };

  const park = async () => {
    const id = Number(choice);
    if (!Number.isSafeInteger(id) || id <= 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const commandId = safeRandomUUID();
      const response = await fetch(`/api/handling-units/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
        body: JSON.stringify({
          action: 'move',
          locationCode: record.code,
          locationVerificationToken: verificationToken,
          placementMethod: verificationToken ? 'scan' : 'manual',
          clientEventId: commandId,
        }),
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string; unchanged?: boolean } | null;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not park the tote');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: locationRecordQueryKey(record.code) }),
        queryClient.invalidateQueries({ queryKey: ['stock-places', 'totes'] }),
      ]);
      toast.success(body.unchanged ? 'Tote is already here' : `Tote parked at ${record.face}`);
      setChoice(null);
      changeOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not park the tote');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!busy) changeOpen(next); }}>
      <SheetContent side="bottom">
        {choosing ? (
          <>
            <div className="flex min-h-14 items-center gap-2 border-b border-border-soft px-2 pr-12">
              <IconButton
                size="touch"
                radius="surface"
                ariaLabel="Back to park tote"
                icon={<ChevronLeft className="h-5 w-5" />}
                onClick={() => { setChoosing(false); setQuery(''); }}
              />
              <div className="min-w-0">
                <SheetTitle>Choose tote</SheetTitle>
                <SheetDescription>{visibleTotes.length} open · destination {record.face}</SheetDescription>
              </div>
            </div>
            <div className="border-b border-border-soft p-2">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Tote number or current location"
                tone="neutral"
                autoFocus
                fillHost
                inputProps={{ 'aria-label': 'Search open totes' }}
              />
            </div>
            <SheetBody className="px-0 pt-0" role="listbox" aria-label="Open totes">
              {totes.isLoading ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-text-muted">Loading open totes…</p>
              ) : visibleTotes.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-text-muted">No open totes found</p>
              ) : visibleTotes.map((tote) => {
                const selected = tote.id === choice;
                return (
                  <button
                    key={tote.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setError(null);
                      setChoice(tote.id);
                      setChoosing(false);
                      setQuery('');
                    }}
                    className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-soft px-4 py-2 text-left active:bg-surface-selected"
                    data-testid="location-park-tote-option"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm font-semibold text-text-default">{tote.code}</span>
                      <span className="block truncate text-[11px] text-text-muted">{totePlace(tote)}</span>
                    </span>
                    {selected ? <Check className="h-5 w-5 text-emerald-600" /> : <ChevronRight className="h-4 w-4 text-text-faint" />}
                  </button>
                );
              })}
            </SheetBody>
          </>
        ) : (
          <>
            <SheetHeader className="border-b border-border-soft pr-12">
              <SheetTitle>Park tote</SheetTitle>
              <SheetDescription>Attach an open tote to {record.face}</SheetDescription>
            </SheetHeader>
            <SheetBody className="grid gap-3">
              <button
                type="button"
                role="combobox"
                aria-expanded="false"
                aria-label={`Choose tote to park at ${record.face}`}
                onClick={() => setChoosing(true)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-emerald-200 bg-surface-card px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                data-testid="location-park-tote-picker"
              >
                <Package className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text-default">{selectedTote?.code ?? 'Choose tote'}</span>
                  <span className="block truncate text-[11px] text-text-muted">{selectedTote ? totePlace(selectedTote) : 'Search by tote number or current location'}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-text-faint" />
              </button>
              {error || totes.error ? (
                <p role="alert" className="text-sm font-semibold text-text-danger">
                  {error || (totes.error instanceof Error ? totes.error.message : 'Could not load totes')}
                </p>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                radius="surface"
                disabled={choice == null}
                loading={busy}
                onClick={() => void park()}
                data-testid="location-park-tote-submit"
              >
                Park at {record.face}
              </Button>
              <p className="text-xs text-text-muted">
                {verificationToken ? 'Placement is backed by this location scan.' : 'Manual placement is recorded in inventory history.'}
              </p>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * V2 location record. A rack placard (`RK12`) is the rack branch
 * (`MobileV2RackRecord`: placement, shelves, Print labels · Move rack · Add
 * shelf); every other code — a rack shelf `RK12-3`, a legacy `C-04-07-3`, a
 * free-form bin — is the stock address below.
 */
export function MobileV2LocationRecord(props: {
  record: LocationRecord;
  returnTo: string;
  verificationToken: string | null;
  backHref: string;
}) {
  const address = parseRackCode(props.record.code);
  if (address && rackLevel(address) === 'rack') {
    return <MobileV2RackRecord code={props.record.code} returnTo={props.returnTo} backHref={props.backHref} />;
  }
  return <StockLocationRecord {...props} />;
}

/** One address, then compact LPN and loose-stock rows; a rack shelf also names its rack and derived room. */
function StockLocationRecord({
  record,
  returnTo,
  verificationToken,
  backHref,
}: {
  record: LocationRecord;
  returnTo: string;
  verificationToken: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<LocationHandlingUnit | null>(null);
  const [parkingTote, setParkingTote] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [removingShelf, setRemovingShelf] = useState(false);
  const rackAddress = useMemo(() => parseRackCode(record.code), [record.code]);
  const legacyBay = useMemo(() => (rackAddress ? null : parseLocationCodeFlat(record.code)), [rackAddress, record.code]);
  // A rack shelf (or an adopted bay shelf that kept its legacy label) belongs to a rack;
  // a legacy bay shelf answers `not_a_rack` until it is adopted.
  const rackQuery = useQuery({
    queryKey: rackQueryKey(record.code),
    queryFn: () => getRack(record.code),
    enabled: rackAddress != null || legacyBay != null,
    retry: false,
  });
  const rack = rackQuery.data?.rack ?? null;
  const rackShelf = rack?.shelves.find((shelf) => shelf.code === record.code) ?? null;
  const canAdopt = legacyBay != null && rackQuery.error instanceof RackRequestError && rackQuery.error.code === 'not_a_rack';
  // A rack's shelves walk shelf to shelf; the room walk reads `locations.room`, which rack rows do not carry.
  const walk = useMemo(() => {
    if (!rack) return rackAddress ? null : record.walk;
    const index = rack.shelves.findIndex((shelf) => shelf.code === record.code);
    if (index < 0) return null;
    return {
      position: index + 1,
      total: rack.shelves.length,
      previous: rack.shelves[index - 1]?.code ?? null,
      next: rack.shelves[index + 1]?.code ?? null,
    };
  }, [rack, rackAddress, record.code, record.walk]);
  const queryClient = useQueryClient();
  const openLocation = (code: string) => router.replace(withJobReturn(locationHubPath(code), backHref));
  const openRack = () => {
    if (rack) router.push(withJobReturn(locationHubPath(rack.code), returnTo));
  };
  const removeShelf = async () => {
    if (!rack) return;
    try {
      const response = await editRackShelves(rack.code, { remove: [record.code], clientEventId: safeRandomUUID() });
      queryClient.setQueryData(rackQueryKey(rack.code), { rack: response.rack });
      void queryClient.invalidateQueries({ queryKey: ['racks'] });
      toast.success(`Removed ${record.face} from ${rack.name}`);
      router.replace(locationHubPath(rack.code));
    } catch (err) {
      toast.error(rackErrorSentence(err, 'Could not remove the shelf.'));
    }
  };

  const reduceMotion = useReducedMotion();
  const walkX = useMotionValue(0);
  const walkGesture = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    axis: 'none' | 'x' | 'y';
    width: number;
    prefetched: string | null;
  } | null>(null);
  const neighbourFaces = useMemo(() => {
    const faceOf = (code: string | null) => {
      if (!code) return null;
      const segments = parseLocationCodeFlat(code);
      return segments ? locationCode(segments) : code;
    };
    return { previous: faceOf(walk?.previous ?? null), next: faceOf(walk?.next ?? null) };
  }, [walk?.previous, walk?.next]);
  // The page moves by `walkX`; each peek card is drawn inside it, so its own
  // offset cancels the page's and docks the card on its screen edge once revealed.
  const nextPeekX = useTransform(walkX, (x) => Math.max(0, WALK_PEEK_WIDTH + Math.min(0, x)) - x);
  const previousPeekX = useTransform(walkX, (x) => Math.min(0, Math.max(0, x) - WALK_PEEK_WIDTH) - x);

  useEffect(() => {
    rememberLocationVisit(record.code, record.face);
  }, [record.code, record.face]);

  // A committed swipe lands here: slide the arriving location in from the
  // side the finger pushed toward; any other arrival starts at rest.
  useLayoutEffect(() => {
    const landing = walkArrival;
    if (!landing || landing.code !== record.code || Date.now() - landing.at > WALK_ARRIVAL_TTL_MS || reduceMotion) {
      walkArrival = null;
      walkX.set(0);
      return;
    }
    walkX.set(landing.from * window.innerWidth);
    const controls = animate(walkX, 0, motionTransitionMobile.viewerPaging);
    return () => controls.stop();
  }, [record.code, reduceMotion, walkX]);

  const settleWalk = (velocity: number) => {
    if (reduceMotion) walkX.set(0);
    else void animate(walkX, 0, { ...motionTransitionMobile.viewerPaging, velocity });
  };

  const endWalk = (canCommit: boolean) => {
    const gesture = walkGesture.current;
    walkGesture.current = null;
    if (!gesture || gesture.axis !== 'x') return;
    const travel = gesture.lastX - gesture.startX;
    const direction = travel < 0 ? -1 : 1;
    const target = direction < 0 ? walk?.next : walk?.previous;
    const flicked = Math.abs(gesture.velocityX) > WALK_FLICK_VELOCITY && Math.sign(gesture.velocityX) === direction;
    if (!canCommit || !target || (Math.abs(travel) < gesture.width * WALK_COMMIT_FRACTION && !flicked)) {
      settleWalk(gesture.velocityX);
      return;
    }
    walkArrival = { code: target, from: direction < 0 ? 1 : -1, at: Date.now() };
    if (reduceMotion) {
      openLocation(target);
      return;
    }
    void animate(walkX, direction * gesture.width, { ...motionTransitionMobile.viewerPaging, velocity: gesture.velocityX })
      .then(() => openLocation(target));
  };

  const holds = useMemo(() => record.handlingUnits.filter((unit) => unit.holdUnits > 0), [record.handlingUnits]);
  const shownLpns = filter === 'hold' ? holds : record.handlingUnits;
  const showLpns = filter === 'all' || filter === 'lpn' || filter === 'hold';
  const showLoose = filter === 'all' || filter === 'loose';
  const unitCount = record.contents.reduce((sum, row) => sum + row.qty, 0)
    + record.handlingUnits.reduce((sum, unit) => sum + unit.totalUnits, 0);
  const scanHref = `/m/scan?intent=location&returnTo=${encodeURIComponent(returnTo)}`;
  const pairParams = new URLSearchParams({ return: returnTo });
  if (verificationToken) pairParams.set('verified', verificationToken);
  const pairHref = `/m/pair/${encodeURIComponent(record.code)}?${pairParams.toString()}`;
  const { has } = useAuth();
  const arrival = useArrivalShelfTiers();
  const urgencyTier = record.id != null ? arrival.data?.tierById.get(record.id) ?? null : null;
  const [urgencyOpen, setUrgencyOpen] = useState(false);
  const printLabels = useLocationLabelPrint();
  /** This location's own sticker, captioned with its arrival urgency when it has one. */
  const printOwnLabel = async (tier: number | null) => {
    try {
      const result = await printLabels([{
        id: record.id ?? 0,
        name: record.face,
        barcode: record.code,
        roomName: record.room,
        arrivalPriorityTier: tier,
      }]);
      const summary = locationLabelPrintSummary(result);
      if (result.transport === 'skipped') toast.error(summary);
      else toast.success(summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not print the location label');
    }
  };

  return (
    <motion.div
      className="flex min-h-full flex-col bg-mode-panel"
      data-testid="mobile-v2-location"
      style={{ x: walkX }}
      onTouchStart={(event) => {
        walkGesture.current = null;
        const touch = event.touches[0];
        if (!walk || event.touches.length !== 1 || !touch) return;
        const target = event.target as Element;
        // Sheets portal out of this DOM subtree but still bubble through React.
        if (!event.currentTarget.contains(target) || target.closest(WALK_IGNORE)) return;
        if (touch.clientX < WALK_EDGE_GUTTER || touch.clientX > window.innerWidth - WALK_EDGE_GUTTER) return;
        walkX.stop();
        walkGesture.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastTime: event.timeStamp,
          velocityX: 0,
          axis: 'none',
          width: event.currentTarget.offsetWidth,
          prefetched: null,
        };
      }}
      onTouchMove={(event) => {
        const gesture = walkGesture.current;
        const touch = event.touches[0];
        if (!gesture || !touch || gesture.axis === 'y') return;
        const dx = touch.clientX - gesture.startX;
        if (gesture.axis === 'none') {
          const dy = touch.clientY - gesture.startY;
          if (Math.abs(dx) < WALK_AXIS_LOCK && Math.abs(dy) < WALK_AXIS_LOCK) return;
          gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (gesture.axis === 'y') return;
        }
        const elapsed = event.timeStamp - gesture.lastTime;
        if (elapsed > 0) gesture.velocityX = ((touch.clientX - gesture.lastX) / elapsed) * 1000;
        gesture.lastX = touch.clientX;
        gesture.lastTime = event.timeStamp;
        const toward = dx < 0 ? walk?.next : walk?.previous;
        // Warm the neighbour's record while the finger is still down, so a
        // committed walk lands on painted stock instead of a loading line.
        if (toward && gesture.prefetched !== toward) {
          gesture.prefetched = toward;
          void queryClient.prefetchQuery({
            queryKey: locationRecordQueryKey(toward),
            queryFn: () => fetchLocationRecord(toward, parseLocationCodeFlat(toward)),
            staleTime: 30_000,
          });
        }
        walkX.set(toward ? dx : dx * WALK_EDGE_RESISTANCE);
      }}
      onTouchEnd={() => endWalk(true)}
      onTouchCancel={() => endWalk(false)}
    >
      <div aria-hidden className="pointer-events-none sticky top-[45dvh] z-sticky h-0 shrink-0">
        {neighbourFaces.previous ? (
          <motion.div
            style={{ x: previousPeekX, y: '-50%' }}
            className="absolute left-0 flex w-40 items-center justify-end gap-2 rounded-r-2xl border border-l-0 border-mode-rule bg-mode-panel py-3 pl-2 pr-3 text-right"
          >
            <ChevronLeft className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="min-w-0">
              <span className="block text-role-micro font-semibold text-text-muted">Previous</span>
              <span className="block truncate font-mono text-sm font-semibold text-mode-ink">{neighbourFaces.previous}</span>
            </span>
          </motion.div>
        ) : null}
        {neighbourFaces.next ? (
          <motion.div
            style={{ x: nextPeekX, y: '-50%' }}
            className="absolute right-0 flex w-40 items-center gap-2 rounded-l-2xl border border-r-0 border-mode-rule bg-mode-panel py-3 pl-3 pr-2"
          >
            <span className="min-w-0">
              <span className="block text-role-micro font-semibold text-text-muted">Next</span>
              <span className="block truncate font-mono text-sm font-semibold text-mode-ink">{neighbourFaces.next}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-emerald-600" />
          </motion.div>
        ) : null}
      </div>

      <MobileV2DetailTopBar
        title={record.face}
        subtitle={rack ? `${rack.name} · ${rackPlacementText(rack)}` : record.room ?? 'Warehouse location'}
        meta={`${record.handlingUnits.length} tote${record.handlingUnits.length === 1 ? '' : 's'} · ${unitCount} units${holds.length ? ` · ${holds.length} hold` : ''}`}
        mono
        backHref={backHref}
        close
        lead={<MapPin className="h-5 w-5 text-emerald-600" />}
        scanHref={scanHref}
        onTitlePress={record.room && !rackAddress && !rack ? () => setPickerOpen(true) : undefined}
        titlePressLabel={`${record.face}, choose location`}
      />

      {legacyBay && record.room ? (
        // The vertical path (the title's picker is the lateral one): each chip opens that level of the stock walk.
        <PathChips
          ariaLabel="Where this location is"
          testId="location-path"
          currentId="here"
          chips={[
            { id: 'room', value: record.room, href: stockDrillHref({ room: record.room }) },
            { id: 'aisle', label: 'Aisle', value: pad2(legacyBay.aisle), href: stockDrillHref({ room: record.room, aisle: Number(legacyBay.aisle) }) },
            {
              id: 'side',
              value: BAY_SIDE_FACE[stockDrillSideOf(Number(legacyBay.bay))].short,
              href: stockDrillHref({ room: record.room, aisle: Number(legacyBay.aisle), side: stockDrillSideOf(Number(legacyBay.bay)) }),
            },
            {
              id: 'bay',
              label: 'Bay',
              value: pad2(legacyBay.bay),
              href: stockDrillHref({ room: record.room, aisle: Number(legacyBay.aisle), bay: Number(legacyBay.bay) }),
            },
            {
              id: 'here',
              label: 'Level',
              value: Number(legacyBay.position) > 0 ? `${noPad(legacyBay.level)} · ${pad2(legacyBay.position)}` : noPad(legacyBay.level),
            },
          ]}
        />
      ) : null}

      {arrival.data && record.id != null ? (
        <LocationUrgencyFact tier={urgencyTier} canEdit={has('sku_stock.manage')} onOpen={() => setUrgencyOpen(true)} />
      ) : null}

      {rack ? (
        <InboundPickerRow
          label="Rack"
          value={rack.name}
          placeholder={rack.name}
          onOpen={openRack}
          testId="location-rack-fact"
        />
      ) : null}
      {/* A shelf verb sits with the shelf's facts, not as a stray button under the contents. */}
      {rackShelf && rackShelf.stockQty === 0 && record.handlingUnits.length === 0 && has('sku_stock.manage') ? (
        <InboundPickerRow
          label="Shelf"
          value={null}
          placeholder="Remove this empty shelf"
          onOpen={() => setRemovingShelf(true)}
          testId="location-remove-shelf"
        />
      ) : null}
      {canAdopt && has('sku_stock.manage') ? (
        <InboundPickerRow
          label="Movable rack"
          value={null}
          placeholder="Make movable rack"
          onOpen={() => setAdopting(true)}
          testId="location-make-rack"
        />
      ) : null}
      {legacyBay && has('print.label') ? (
        <InboundPickerRow
          label="Labels"
          value={null}
          placeholder="Print this location's stickers or a run"
          onOpen={() => router.push(withJobReturn(locationLabelsHref({ code: record.code }), returnTo))}
          testId="location-print-labels"
        />
      ) : null}

      <nav className="sticky top-14 z-sticky flex gap-2 overflow-x-auto border-b border-mode-rule bg-mode-panel/95 px-mode-page py-2 backdrop-blur" aria-label="Location contents">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3 text-xs font-semibold',
              filter === item.id
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-mode-rule bg-mode-panel text-mode-ink',
            )}
          >
            {item.label}
            {item.id === 'lpn' ? ` ${record.handlingUnits.length}` : item.id === 'loose' ? ` ${record.contents.length}` : item.id === 'hold' ? ` ${holds.length}` : ''}
          </button>
        ))}
      </nav>

      <div className="flex-1">
        {showLpns ? shownLpns.map((unit) => <LpnRow key={unit.id} unit={unit} onOpen={() => setSelected(unit)} />) : null}
        {showLoose ? <LocationStockPositions record={record} returnTo={returnTo} verificationToken={verificationToken} /> : null}
        {((showLpns && shownLpns.length === 0) && (!showLoose || record.contents.length === 0)) ? (
          <div className="px-6 py-16 text-center">
            <Package className="mx-auto h-6 w-6 text-text-faint" />
            <p className="mt-2 text-sm font-semibold text-text-default">Nothing in this view</p>
            <Button onClick={() => router.push(scanHref)} variant="secondary" size="lg" radius="surface" icon={<ScanBarcode />} className="mt-4">
              Scan location work
            </Button>
          </div>
        ) : null}
      </div>

      <DetailDock
        label="Location actions"
        verbs={[
          { id: 'pair', label: 'Pair SKU', icon: <Plus />, primary: true, testId: 'location-pair-sku' },
          { id: 'tote', label: 'Park tote', icon: <Package />, testId: 'location-park-tote' },
          { id: 'print', label: 'Print label', icon: <Printer />, testId: 'location-print-label' },
        ] as const}
        onVerb={(verb) => {
          if (verb === 'pair') router.push(pairHref);
          else if (verb === 'print') return printOwnLabel(urgencyTier);
          else setParkingTote(true);
        }}
      />

      <Sheet open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="bottom">
          {selected ? (() => {
            const face = handlingUnitQcFace(selected);
            const moveHref = `/m/scan?intent=location&moveLpn=${selected.id}&returnTo=${encodeURIComponent(containerPath(selected.id))}`;
            return (
              <>
                <SheetHeader className="border-b border-border-soft pr-12">
                  <SheetTitle className="font-mono">{selected.code}</SheetTitle>
                  <SheetDescription>{face.label} · {selected.totalUnits} units · {record.face}</SheetDescription>
                </SheetHeader>
                <SheetBody className="grid gap-3">
                  {selected.holdUnits > 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-surface-danger px-3 py-2 text-sm font-semibold text-text-danger">
                      <AlertTriangle className="h-4 w-4" />
                      {selected.holdUnits} unit{selected.holdUnits === 1 ? '' : 's'} must be resolved
                    </div>
                  ) : null}
                  <Button variant="primary" size="lg" radius="surface" onClick={() => router.push(`/m/qc/lpn/${selected.id}`)}>
                    {face.next}
                  </Button>
                  <Button variant="secondary" size="lg" radius="surface" icon={<ScanBarcode />} onClick={() => router.push(moveHref)}>
                    Move · scan destination
                  </Button>
                  <Button variant="secondary" size="lg" radius="surface" icon={<Printer />} onClick={() => printHandlingUnitLabel({ handlingUnitId: selected.id, code: selected.code })}>
                    Print tote label
                  </Button>
                  <Button variant="ghost" size="lg" radius="surface" onClick={() => router.push(containerPath(selected.id))}>
                    Open full record
                  </Button>
                </SheetBody>
              </>
            );
          })() : null}
        </SheetContent>
      </Sheet>

      <ParkToteSheet
        open={parkingTote}
        onOpenChange={setParkingTote}
        record={record}
        verificationToken={verificationToken}
      />

      <LocationUrgencySheet
        open={urgencyOpen}
        onClose={() => setUrgencyOpen(false)}
        barcode={record.code}
        face={record.face}
        tier={urgencyTier}
        onPrint={printOwnLabel}
      />

      {legacyBay ? <MobileV2AdoptBaySheet bayCode={record.code} open={adopting} onClose={() => setAdopting(false)} /> : null}

      <ConfirmSheet
        open={removingShelf}
        onClose={() => setRemovingShelf(false)}
        title={`Remove ${record.face}?`}
        message={rack ? `${rack.name} keeps its other shelves. Peel this shelf's label off the rack.` : undefined}
        confirmLabel="Remove shelf"
        destructive
        onConfirm={() => {
          setRemovingShelf(false);
          void removeShelf();
        }}
      />

      {pickerOpen && record.room ? (
        <MobileV2LocationPicker
          onClose={() => setPickerOpen(false)}
          room={record.room}
          currentCode={record.code}
          currentFace={record.face}
          walk={walk}
          onChoose={(code) => {
            setPickerOpen(false);
            if (code !== record.code) openLocation(code);
          }}
        />
      ) : null}
    </motion.div>
  );
}
