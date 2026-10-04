'use client';

/**
 * The ordinal location picker (V2_OBJECT_FIRST.md §6, D15): the location
 * title opens the current room in physical walk order — current row centred
 * and selected, code search, recents — and a row switches location in place.
 * The room's list is read when the picker opens, never on page load.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, History } from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SearchField } from '@/design-system/primitives';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import type { LocationWalkStep } from '@/components/mobile/scan/location-bind-types';
import { cn } from '@/utils/_cn';

/** One row of `GET /api/locations?room=` — the room's walk, in order. */
export type RoomLocation = {
  barcode: string;
  name: string;
  /** Dashed face (`C-03-10-3-00`), the same face the record's title wears. */
  face: string;
  /** Loose units on hand (bin contents). */
  units: number;
  /** LPNs parked here. */
  lpns: number;
};

type RecentLocation = { code: string; face: string };

/** Last few locations opened in this tab (sessionStorage, newest first). */
const RECENTS_KEY = 'cf:m-location-recents';
const RECENTS_STORED = 8;
const RECENTS_SHOWN = 4;

function readRecents(): RecentLocation[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(RECENTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentLocation =>
        typeof entry?.code === 'string' && entry.code.length > 0 && typeof entry?.face === 'string',
    );
  } catch {
    return [];
  }
}

/** Record that this tab opened a location (the picker's recents). */
export function rememberLocationVisit(code: string, face: string): void {
  try {
    const next = [{ code, face }, ...readRecents().filter((entry) => entry.code !== code)].slice(0, RECENTS_STORED);
    sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota: the picker simply shows no recents.
  }
}

async function fetchRoomLocations(room: string): Promise<RoomLocation[]> {
  const response = await fetch(`/api/locations?room=${encodeURIComponent(room)}`, { credentials: 'include', cache: 'no-store' });
  const body = (await response.json().catch(() => null)) as { locations?: RoomLocation[]; error?: string } | null;
  if (!response.ok) throw new Error(body?.error || 'Could not load this room');
  return body?.locations ?? [];
}

/** Separators and case do not count; a scanned (or GS1-wrapped) code finds its row. */
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function locationMatches(location: RoomLocation, query: string): boolean {
  const needle = squash(unwrapScannedLocation(query));
  if (!needle) return true;
  const code = squash(location.barcode);
  return code.includes(needle)
    || needle.includes(code)
    || squash(location.face).includes(needle)
    || squash(location.name).includes(needle);
}

/** `C-03-10-3-00` → `C-03` (zone · aisle); a non-address code has no aisle. */
function aisleOf(location: RoomLocation): string {
  const parts = location.face.split('-');
  return parts.length === 5 ? `${parts[0]}-${parts[1]}` : '';
}

function occupancy(location: RoomLocation): string {
  const parts: string[] = [];
  if (location.units > 0) parts.push(`${location.units} unit${location.units === 1 ? '' : 's'}`);
  if (location.lpns > 0) parts.push(`${location.lpns} tote${location.lpns === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'Empty';
}

const ROW_CLASS =
  'flex min-h-12 w-full items-center gap-3 border-b border-mode-rule px-mode-page text-left active:bg-mode-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent';

const GROUP_LABEL_CLASS =
  'sticky top-0 z-sticky border-b border-mode-rule bg-surface-card px-mode-page pb-1 pt-3 text-role-micro font-semibold text-text-muted';

/**
 * Mount only while open (the sheet has no exit animation): every open starts
 * with an empty search, fresh recents, and the current row centred.
 */
export function MobileV2LocationPicker({
  onClose,
  room,
  currentCode,
  currentFace,
  walk,
  onChoose,
}: {
  onClose: () => void;
  room: string;
  currentCode: string;
  currentFace: string;
  walk: LocationWalkStep | null;
  /** Switch to this location (a barcode); the caller closes the picker. */
  onChoose: (code: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [recents] = useState(() => readRecents().filter((entry) => entry.code !== currentCode).slice(0, RECENTS_SHOWN));
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLButtonElement | null>(null);
  const centred = useRef(false);

  const locations = useQuery({
    queryKey: ['locations', 'room-walk', room],
    queryFn: () => fetchRoomLocations(room),
    staleTime: 30_000,
  });

  const searching = query.trim().length > 0;
  /** The visible rows in walk order, cut into contiguous aisle runs. */
  const aisles = useMemo(() => {
    const runs: Array<{ aisle: string; rows: RoomLocation[] }> = [];
    for (const location of locations.data ?? []) {
      if (!locationMatches(location, query)) continue;
      const aisle = aisleOf(location);
      const last = runs[runs.length - 1];
      if (last?.aisle === aisle) last.rows.push(location);
      else runs.push({ aisle, rows: [location] });
    }
    return runs;
  }, [locations.data, query]);

  // Centre the current row once, as soon as the room has painted.
  useEffect(() => {
    const body = bodyRef.current;
    const target = currentRowRef.current;
    if (centred.current || !body || !target) return;
    centred.current = true;
    const bodyBox = body.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    body.scrollTop += targetBox.top - bodyBox.top - (bodyBox.height - targetBox.height) / 2;
  }, [locations.data]);

  const row = (location: RoomLocation) => {
    const current = location.barcode === currentCode;
    const name = squash(location.name);
    const nameDiffers = !squash(location.face).includes(name) && !squash(location.barcode).includes(name);
    return (
      <button
        key={location.barcode}
        ref={current ? currentRowRef : undefined}
        type="button"
        role="option"
        aria-selected={current}
        onClick={() => onChoose(location.barcode)}
        className={cn(ROW_CLASS, current && 'bg-mode-well')}
        data-testid="location-picker-row"
        data-code={location.barcode}
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words font-mono text-sm font-semibold text-mode-ink">{location.face}</span>
          {nameDiffers ? <span className="block break-words text-role-caption text-text-muted">{location.name}</span> : null}
        </span>
        <span className={cn('shrink-0 text-role-caption font-semibold tabular-nums', location.units + location.lpns > 0 ? 'text-mode-ink' : 'text-text-muted')}>
          {occupancy(location)}
        </span>
        {current ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <span className="h-5 w-5 shrink-0" aria-hidden />}
      </button>
    );
  };

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" data-testid="location-picker">
        <SheetHeader className="shrink-0 gap-0.5 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{room}</SheetTitle>
          <SheetDescription>
            <span className="font-mono">{currentFace}</span>
            {walk ? ` · ${walk.position} of ${walk.total}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="h-12 shrink-0 border-b border-mode-rule px-mode-page py-2">
          <SearchField
            value={query}
            onChange={setQuery}
            onSearch={(value) => {
              const first = (locations.data ?? []).find((location) => locationMatches(location, value));
              if (first) onChoose(first.barcode);
            }}
            debounceMs={80}
            placeholder="Location code"
            tone="neutral"
            fillHost
            inputProps={{ 'aria-label': `Search ${room}`, 'data-testid': 'location-picker-search' }}
          />
        </div>
        <SheetBody ref={bodyRef} className="px-0 pt-0">
          {!searching && recents.length > 0 ? (
            <section aria-labelledby="location-picker-recents-label" data-testid="location-picker-recents">
              <h3 id="location-picker-recents-label" className={GROUP_LABEL_CLASS}>Recent</h3>
              {recents.map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  onClick={() => onChoose(entry.code)}
                  className={ROW_CLASS}
                  data-testid="location-picker-recent"
                >
                  <History className="h-4 w-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1 break-words font-mono text-sm font-semibold text-mode-ink">{entry.face}</span>
                </button>
              ))}
            </section>
          ) : null}
          {locations.isPending ? (
            <p className="px-mode-page py-8 text-center text-sm font-semibold text-text-muted">Loading {room}…</p>
          ) : locations.error ? (
            <p role="alert" className="px-mode-page py-8 text-center text-sm font-semibold text-text-danger">
              {locations.error instanceof Error ? locations.error.message : 'Could not load this room'}
            </p>
          ) : aisles.length === 0 ? (
            <p className="px-mode-page py-8 text-center text-sm font-semibold text-text-muted">No location matches</p>
          ) : (
            <div role="listbox" aria-label={`Locations in ${room}`}>
              {aisles.length === 1
                ? aisles[0].rows.map(row)
                : aisles.map((run, index) => (
                  <div key={`${run.aisle}-${index}`} role="group" aria-labelledby={`location-picker-aisle-${index}`}>
                    <p id={`location-picker-aisle-${index}`} className={GROUP_LABEL_CLASS}>
                      {run.aisle ? `Aisle ${run.aisle}` : 'Other'}
                    </p>
                    {run.rows.map(row)}
                  </div>
                ))}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
