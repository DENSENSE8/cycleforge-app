'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, MapPin, Package, Plus, Printer, ScanBarcode } from '@/components/Icons';
import { LocationStockPositions } from '@/components/mobile/location/LocationStockPositions';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationHandlingUnit, LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button, IconButton, SearchField } from '@/design-system/primitives';
import { handlingUnitQcFace } from '@/lib/handling-unit-presentation';
import type { StockTote } from '@/lib/inventory/stock-places';
import { printHandlingUnitLabel } from '@/lib/print/printHandlingUnitLabel';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';

type Filter = 'all' | 'lpn' | 'loose' | 'hold';

type WalkLocation = {
  id: number;
  name: string;
  barcode: string | null;
  room: string | null;
};

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'lpn', label: 'LPNs' },
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
      <SheetContent side="bottom" className="h-[86dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="listbox" aria-label="Open totes">
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
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b border-border-soft pr-12">
              <SheetTitle>Park tote</SheetTitle>
              <SheetDescription>Attach an open LPN/tote to {record.face}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 p-4">
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
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** V2 location: one address, then compact LPN and loose-stock rows. */
export function MobileV2LocationRecord({
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
  const swipeStart = useRef<{ x: number; y: number; interactive: boolean } | null>(null);
  const locationWalk = useQuery<WalkLocation[]>({
    queryKey: ['mobile-location-walk', record.room],
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch('/api/locations', { credentials: 'include', cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as { locations?: WalkLocation[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || 'Could not load adjacent locations');
      return (body?.locations ?? []).filter((location) => {
        if (!location.barcode?.trim()) return false;
        return record.room ? location.room === record.room : !location.room;
      });
    },
  });
  const flatCode = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const currentWalkIndex = (locationWalk.data ?? []).findIndex((location) => (
    flatCode(location.barcode) === flatCode(record.code)
    || flatCode(location.name) === flatCode(record.face)
  ));
  const previousLocation = currentWalkIndex > 0 ? locationWalk.data?.[currentWalkIndex - 1] ?? null : null;
  const nextLocation = currentWalkIndex >= 0 && currentWalkIndex < (locationWalk.data?.length ?? 0) - 1
    ? locationWalk.data?.[currentWalkIndex + 1] ?? null
    : null;
  const openAdjacent = (location: WalkLocation | null) => {
    const code = location?.barcode?.trim();
    if (!code) return;
    router.replace(withJobReturn(locationHubPath(code), backHref));
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

  return (
    <div
      className="flex min-h-full flex-col bg-mode-panel"
      data-testid="mobile-v2-location"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        const target = event.target as Element | null;
        swipeStart.current = {
          x: touch.clientX,
          y: touch.clientY,
          interactive: Boolean(target?.closest('button, a, input, textarea, select, [role="slider"], [role="dialog"]')),
        };
      }}
      onTouchEnd={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch || start.interactive) return;
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
        openAdjacent(deltaX < 0 ? nextLocation : previousLocation);
      }}
    >
      <MobileDetailTopBar
        title={record.face}
        subtitle={record.room ?? 'Warehouse location'}
        meta={`${record.handlingUnits.length} LPN${record.handlingUnits.length === 1 ? '' : 's'} · ${unitCount} units${holds.length ? ` · ${holds.length} hold` : ''}${currentWalkIndex >= 0 ? ` · ${currentWalkIndex + 1}/${locationWalk.data?.length ?? 0}` : ''}`}
        mono
        backHref={backHref}
        close
        lead={<MapPin className="h-5 w-5 text-emerald-600" />}
        scanHref={scanHref}
        right={
          <div className="flex items-center" aria-label="Browse warehouse locations">
            <IconButton
              size="touch"
              radius="flush"
              ariaLabel="Previous location"
              icon={<ChevronLeft className="h-5 w-5" />}
              disabled={!previousLocation}
              onClick={() => openAdjacent(previousLocation)}
              data-testid="location-previous"
            />
            <IconButton
              size="touch"
              radius="flush"
              ariaLabel="Next location"
              icon={<ChevronRight className="h-5 w-5" />}
              disabled={!nextLocation}
              onClick={() => openAdjacent(nextLocation)}
              data-testid="location-next"
            />
          </div>
        }
      />

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
            <Button href={scanHref} variant="secondary" size="lg" radius="surface" icon={<ScanBarcode />} className="mt-4">
              Scan location work
            </Button>
          </div>
        ) : null}
      </div>

      <footer className="sticky bottom-0 z-sticky grid grid-cols-2 gap-2 border-t border-mode-rule bg-mode-panel p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button
          variant="primary"
          size="lg"
          radius="surface"
          icon={<Plus />}
          onClick={() => router.push(pairHref)}
          data-testid="location-pair-sku"
        >
          Pair SKU
        </Button>
        <Button
          variant="secondary"
          size="lg"
          radius="surface"
          icon={<Package />}
          onClick={() => setParkingTote(true)}
          data-testid="location-park-tote"
        >
          Park tote
        </Button>
      </footer>

      <Sheet open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="bottom" className="max-h-[86dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {selected ? (() => {
            const face = handlingUnitQcFace(selected);
            const moveHref = `/m/scan?intent=location&moveLpn=${selected.id}&returnTo=${encodeURIComponent(`/m/h/${selected.id}`)}`;
            return (
              <>
                <SheetHeader className="border-b border-border-soft pr-12">
                  <SheetTitle className="font-mono">{selected.code}</SheetTitle>
                  <SheetDescription>{face.label} · {selected.totalUnits} units · {record.face}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-3 overflow-y-auto p-4">
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
                    Print LPN label
                  </Button>
                  <Button variant="ghost" size="lg" radius="surface" onClick={() => router.push(`/m/h/${selected.id}`)}>
                    Open full record
                  </Button>
                </div>
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
    </div>
  );
}
