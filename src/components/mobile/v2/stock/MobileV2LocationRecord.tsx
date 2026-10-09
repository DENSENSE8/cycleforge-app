'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, Package, Plus, Printer, ScanBarcode } from '@/components/Icons';
import { LocationStockPositions } from '@/components/mobile/location/LocationStockPositions';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { fetchLocationRecord, locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationHandlingUnit, LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { InboundPickerRow } from '@/components/mobile/v2/inbound/MobileV2InboundParts';
import { MobileV2RackRecord } from '@/components/mobile/v2/racks/MobileV2RackRecord';
import { rackErrorSentence } from '@/components/mobile/v2/racks/rack-presentation';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives';
import { DetailDock } from '@/design-system/components/DetailDock';
import { PathChips } from '@/design-system/components/PathChips';
import { motionTransitionMobile } from '@/design-system/foundations/motion-presets';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from '@/design-system/motion';
import { BAY_SIDE_FACE, locationCode, noPad, pad2, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { stockDrillHref, stockDrillSideOf } from '@/lib/inventory/stock-drill';
import { parseRackCode, rackLevel } from '@/lib/locations/rack-code';
import { rackPlacementText } from '@/lib/locations/rack-display';
import { editRackShelves, getRack, rackQueryKey } from '@/lib/locations/racks-client';
import { handlingUnitQcFace } from '@/lib/handling-unit-presentation';
import { printHandlingUnitLabel } from '@/lib/print/printHandlingUnitLabel';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { previousMobilePath, withJobReturn } from '@/lib/mobile/nav-trail';
import { locationScanLanding, withLocationScanLanding } from '@/lib/mobile/location-scan-landing';
import { containerPath } from '@/lib/nav/route-tree';
import { useAuth } from '@/contexts/AuthContext';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { locationLabelPrintSummary } from '@/lib/print/printLocationRows';
import { MobileV2LocationPicker, rememberLocationVisit } from './MobileV2LocationPicker';
import { LocationToteSheet } from './LocationToteSheet';

/*
 * The lateral walk: the page stays still under the finger — only the
 * neighbour's bookmark slides in from the side being pulled, so this
 * location's stock stays readable the whole time. Past the commit distance
 * the bookmark arms; releasing armed (or a flick) swaps the page, anything
 * less tucks the bookmark away. A swipe may start on an item row (the row's
 * tap is withheld after a drag), never on a control or in the OS's edge
 * gutters (F9). The visible way to a sibling is the title's ordinal picker.
 */
/** px from either screen edge that belong to the OS back / system gestures (F9). */
const WALK_EDGE_GUTTER = 24;
/** px of travel before a touch is read as horizontal (walk) or vertical (scroll). */
const WALK_AXIS_LOCK = 10;
/** Width of the neighbour bookmark — must match its `w-40`. */
const WALK_PEEK_WIDTH = 160;
/** px of pull that arms the bookmark: release past it commits. */
const WALK_COMMIT_DISTANCE = 112;
/** px/s — a flick toward a neighbour commits regardless of travel. */
const WALK_FLICK_VELOCITY = 500;
/** Pull damping toward a side with no neighbour (first / last of the room). */
const WALK_EDGE_RESISTANCE = 0.25;
/** Touches that start on a control, a horizontal strip, or a sheet are not walks — except a row's whole-row target. */
const WALK_IGNORE = 'button, a, input, textarea, select, label, nav, [role="slider"], [role="dialog"]';
const WALK_THROUGH = '[data-walk-through]';

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
  // A tote loaded from shelves holds stock, not serialized units: it has no QC stage to show.
  const stockOnly = unit.totalUnits === 0 && unit.stockUnits > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid min-h-14 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-mode-rule bg-mode-panel px-mode-page py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
      data-testid="location-lpn-row"
      data-walk-through
    >
      <span className={cn('h-2.5 w-2.5 justify-self-center rounded-full', stockOnly ? TONE.info : TONE[face.tone])} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-mono text-sm font-semibold text-mode-ink">{unit.code}</span>
        <span className="block truncate text-[11px] leading-4 text-mode-muted">{stockOnly ? 'Stock tote' : face.label}</span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-bold tabular-nums text-mode-ink">{unit.totalUnits + unit.stockUnits}</span>
        <span className={cn('block text-[10px] font-semibold', face.tone === 'danger' && !stockOnly ? 'text-rose-600' : 'text-mode-muted')}>
          {unit.pairedOrderId ? 'Allocated' : stockOnly ? 'In tote' : face.next}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-mode-muted" />
    </button>
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
  /** A one-item location scan: open this SKU's stock sheet on adjust. */
  adjustSku: string | null;
  /** A several-item location scan: loose rows first, as the item picker. */
  pick: boolean;
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
  adjustSku,
  pick,
}: {
  record: LocationRecord;
  returnTo: string;
  verificationToken: string | null;
  backHref: string;
  adjustSku: string | null;
  pick: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(pick ? 'loose' : 'all');
  const [selected, setSelected] = useState<LocationHandlingUnit | null>(null);
  const [parkingTote, setParkingTote] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  // A record opened by a location scan carries its proof: that is the scan loop.
  const inScanLoop = verificationToken != null;
  const nextCode = walk?.next ?? null;
  // Warm the next location while the operator adjusts this one, so Next paints at once.
  useEffect(() => {
    if (!inScanLoop || !nextCode) return;
    void queryClient.prefetchQuery({
      queryKey: locationRecordQueryKey(nextCode),
      queryFn: () => fetchLocationRecord(nextCode, parseLocationCodeFlat(nextCode)),
      staleTime: 30_000,
    });
  }, [inScanLoop, nextCode, queryClient]);
  /** The next location, landed the way a scan lands: one item opens on its adjust (the count path — no scan proof there). */
  const openNext = () => {
    if (!nextCode) return;
    void queryClient
      .fetchQuery({
        queryKey: locationRecordQueryKey(nextCode),
        queryFn: () => fetchLocationRecord(nextCode, parseLocationCodeFlat(nextCode)),
        staleTime: 30_000,
      })
      .then((next) => router.replace(withLocationScanLanding(withJobReturn(locationHubPath(nextCode), backHref), locationScanLanding(next))))
      .catch(() => openLocation(nextCode));
  };
  /** Done in the scan loop: back to the camera (the scan page itself, or a location scan that keeps this record's way home). */
  const returnToScan = () => {
    const scanPath = '/m/scan';
    if (previousMobilePath() === scanPath) router.back();
    else router.replace(backHref.split(/[?#]/)[0] === scanPath ? backHref : `${scanPath}?intent=location&returnTo=${encodeURIComponent(backHref)}`);
  };
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
  /** The finger's signed pull (px): negative pulls the next bookmark in from the right, positive the previous one from the left. */
  const pullX = useMotionValue(0);
  /** Which bookmark is past the commit distance (release opens it). */
  const [armed, setArmed] = useState<'previous' | 'next' | null>(null);
  /** A drag just ended: the row tap that may follow it is not a tap. */
  const suppressClickUntil = useRef(0);
  const walkGesture = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    axis: 'none' | 'x' | 'y';
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
  // Each bookmark rests just off its screen edge and slides in by the pull, docking once fully out.
  const nextPeekX = useTransform(pullX, (x) => Math.max(0, WALK_PEEK_WIDTH + Math.min(0, x)));
  const previousPeekX = useTransform(pullX, (x) => Math.min(0, Math.max(0, x) - WALK_PEEK_WIDTH));

  useEffect(() => {
    rememberLocationVisit(record.code, record.face);
  }, [record.code, record.face]);

  // The swapped-in location starts with both bookmarks tucked away.
  useEffect(() => {
    pullX.set(0);
    setArmed(null);
  }, [record.code, pullX]);

  const tuckBookmarks = (velocity: number) => {
    setArmed(null);
    if (reduceMotion) pullX.set(0);
    else void animate(pullX, 0, { ...motionTransitionMobile.viewerPaging, velocity });
  };

  const endWalk = (canCommit: boolean) => {
    const gesture = walkGesture.current;
    walkGesture.current = null;
    if (!gesture || gesture.axis !== 'x') return;
    suppressClickUntil.current = Date.now() + 400;
    const travel = gesture.lastX - gesture.startX;
    const direction = travel < 0 ? -1 : 1;
    const target = direction < 0 ? walk?.next : walk?.previous;
    const flicked = Math.abs(gesture.velocityX) > WALK_FLICK_VELOCITY && Math.sign(gesture.velocityX) === direction;
    if (!canCommit || !target || (Math.abs(travel) < WALK_COMMIT_DISTANCE && !flicked)) {
      tuckBookmarks(gesture.velocityX);
      return;
    }
    // The bookmark docks fully, then the page swaps underneath it.
    setArmed(direction < 0 ? 'next' : 'previous');
    if (reduceMotion) {
      openLocation(target);
      return;
    }
    void animate(pullX, direction * WALK_PEEK_WIDTH, { ...motionTransitionMobile.viewerPaging, velocity: gesture.velocityX })
      .then(() => openLocation(target));
  };

  const holds = useMemo(() => record.handlingUnits.filter((unit) => unit.holdUnits > 0), [record.handlingUnits]);
  const shownLpns = filter === 'hold' ? holds : record.handlingUnits;
  const showLpns = filter === 'all' || filter === 'lpn' || filter === 'hold';
  const showLoose = filter === 'all' || filter === 'loose';
  const unitCount = record.contents.reduce((sum, row) => sum + row.qty, 0)
    + record.handlingUnits.reduce((sum, unit) => sum + unit.totalUnits + unit.stockUnits, 0);
  const scanHref = `/m/scan?intent=location&returnTo=${encodeURIComponent(returnTo)}`;
  const pairParams = new URLSearchParams({ return: returnTo });
  if (verificationToken) pairParams.set('verified', verificationToken);
  const pairHref = `/m/pair/${encodeURIComponent(record.code)}?${pairParams.toString()}`;
  const { has } = useAuth();
  const printLabels = useLocationLabelPrint();
  /** Print this location's own sticker from the record's single Print label action. */
  const printOwnLabel = async () => {
    try {
      const result = await printLabels([{
        id: record.id ?? 0,
        name: record.face,
        barcode: record.code,
        roomName: record.room,
      }]);
      const summary = locationLabelPrintSummary(result);
      if (result.transport === 'skipped') toast.error(summary);
      else toast.success(summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not print the location label');
    }
  };

  return (
    <div
      // pan-y: the browser keeps vertical scrolling; a horizontal drag is the walk's alone.
      className="flex min-h-full touch-pan-y flex-col bg-mode-panel"
      data-testid="mobile-v2-location"
      onClickCapture={(event) => {
        // The finger that just walked lifts over a row: that is not a tap on it.
        if (Date.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onTouchStart={(event) => {
        walkGesture.current = null;
        const touch = event.touches[0];
        if (!walk || event.touches.length !== 1 || !touch) return;
        const target = event.target as Element;
        // Sheets portal out of this DOM subtree but still bubble through React.
        if (!event.currentTarget.contains(target)) return;
        if (target.closest(WALK_IGNORE) && !target.closest(WALK_THROUGH)) return;
        if (touch.clientX < WALK_EDGE_GUTTER || touch.clientX > window.innerWidth - WALK_EDGE_GUTTER) return;
        pullX.stop();
        walkGesture.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastTime: event.timeStamp,
          velocityX: 0,
          axis: 'none',
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
        const pull = toward ? dx : dx * WALK_EDGE_RESISTANCE;
        pullX.set(pull);
        const nextArmed = toward && Math.abs(pull) >= WALK_COMMIT_DISTANCE ? (dx < 0 ? 'next' : 'previous') : null;
        if (nextArmed !== armed) setArmed(nextArmed);
      }}
      onTouchEnd={() => endWalk(true)}
      onTouchCancel={() => endWalk(false)}
    >
      <div aria-hidden className="pointer-events-none sticky top-[45dvh] z-sticky h-0 shrink-0">
        {neighbourFaces.previous ? (
          <motion.div
            style={{ x: previousPeekX, y: '-50%' }}
            className={cn(
              'absolute left-0 flex w-40 items-center justify-end gap-2 rounded-r-2xl border border-l-0 py-3 pl-2 pr-3 text-right shadow-lg transition-colors duration-150',
              armed === 'previous' ? 'border-emerald-600 bg-emerald-600' : 'border-mode-rule bg-mode-panel',
            )}
          >
            <ChevronLeft className={cn('h-5 w-5 shrink-0', armed === 'previous' ? 'text-white' : 'text-emerald-600')} />
            <span className="min-w-0">
              <span className={cn('block text-role-micro font-semibold', armed === 'previous' ? 'text-white/80' : 'text-text-muted')}>Previous</span>
              <span className={cn('block truncate font-mono text-sm font-semibold', armed === 'previous' ? 'text-white' : 'text-mode-ink')}>{neighbourFaces.previous}</span>
            </span>
          </motion.div>
        ) : null}
        {neighbourFaces.next ? (
          <motion.div
            style={{ x: nextPeekX, y: '-50%' }}
            className={cn(
              'absolute right-0 flex w-40 items-center gap-2 rounded-l-2xl border border-r-0 py-3 pl-3 pr-2 shadow-lg transition-colors duration-150',
              armed === 'next' ? 'border-emerald-600 bg-emerald-600' : 'border-mode-rule bg-mode-panel',
            )}
          >
            <span className="min-w-0">
              <span className={cn('block text-role-micro font-semibold', armed === 'next' ? 'text-white/80' : 'text-text-muted')}>Next</span>
              <span className={cn('block truncate font-mono text-sm font-semibold', armed === 'next' ? 'text-white' : 'text-mode-ink')}>{neighbourFaces.next}</span>
            </span>
            <ChevronRight className={cn('h-5 w-5 shrink-0', armed === 'next' ? 'text-white' : 'text-emerald-600')} />
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
        {showLoose ? (
          <LocationStockPositions
            record={record}
            returnTo={returnTo}
            verificationToken={verificationToken}
            adjustSku={adjustSku}
            pick={pick}
            next={nextCode && neighbourFaces.next ? { face: neighbourFaces.next, open: openNext } : null}
            doneReturn={inScanLoop ? returnToScan : null}
          />
        ) : null}
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
          { id: 'tote', label: record.contents.some((row) => row.qty > 0) ? 'Load tote' : 'Park tote', icon: <Package />, testId: 'location-park-tote' },
          { id: 'print', label: 'Print label', icon: <Printer />, testId: 'location-print-label' },
        ] as const}
        onVerb={(verb) => {
          if (verb === 'pair') router.push(pairHref);
          else if (verb === 'print') return printOwnLabel();
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
                  <SheetDescription>
                    {selected.totalUnits === 0 && selected.stockUnits > 0 ? 'Stock tote' : face.label} · {selected.totalUnits + selected.stockUnits} units · {record.face}
                  </SheetDescription>
                </SheetHeader>
                <SheetBody className="grid gap-3">
                  {selected.holdUnits > 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-surface-danger px-3 py-2 text-sm font-semibold text-text-danger">
                      <AlertTriangle className="h-4 w-4" />
                      {selected.holdUnits} unit{selected.holdUnits === 1 ? '' : 's'} must be resolved
                    </div>
                  ) : null}
                  {selected.stockUnits > 0 ? (
                    <Button
                      variant={selected.totalUnits === 0 ? 'primary' : 'secondary'}
                      size="lg"
                      radius="surface"
                      icon={<Package />}
                      onClick={() => router.push(withJobReturn(locationHubPath(selected.code), returnTo))}
                    >
                      Open tote stock · {selected.stockUnits}
                    </Button>
                  ) : null}
                  {selected.totalUnits > 0 || selected.stockUnits === 0 ? (
                    <Button variant="primary" size="lg" radius="surface" onClick={() => router.push(`/m/qc/lpn/${selected.id}`)}>
                      {face.next}
                    </Button>
                  ) : null}
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

      <LocationToteSheet
        open={parkingTote}
        onOpenChange={setParkingTote}
        record={record}
        verificationToken={verificationToken}
        next={nextCode && neighbourFaces.next ? { face: neighbourFaces.next, open: openNext } : null}
        onScanNext={inScanLoop ? returnToScan : () => router.push(scanHref)}
      />

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
    </div>
  );
}
