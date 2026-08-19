'use client';

/**
 * @domain-job Station Displays → **Locations** — browse the addresses this
 *   warehouse has, place the open entity on one, reprint a scuffed sticker,
 *   or mint a new spot without leaving the bench.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse `LocationCrudDialog` — that is the Inventory
 *   admin editor behind a modal scrim; this is a Displays leaf whose rows are
 *   ONE armed control on the keyboard path, next to a carton in hand.
 *
 * Shared by Arrival, Unbox, and Ready to Pack through
 * {@link StationLocationPlacementPort}: same interaction at all three benches,
 * three different writers (triage staging · line putaway · pack placement).
 *
 * **Why a LIST and not a create form.** The first cut of this leaf was
 * create-only, which answered the rarer half of the job: an operator reprints a
 * scuffed shelf label far more often than they invent a shelf, and Arrival could
 * not do that at all. A list makes viewing and printing the default and demotes
 * creation to one mode inside it.
 *
 * **Why a mode segment and not a print button per row.** Displays armed rows are
 * ONE control — never a nested button, kebab or icon inside the row
 * (`display/station-workbench.md` → armed-row grammar), because a second control
 * makes the row's own commit ambiguous at a bench and is unreachable by the
 * keyboard path the row already owns. So the sanctioned shape is a child
 * `TabDisplay appearance="segment"` in the leaf header's trailing slot
 * (`setLeafTrailing`, the Claim Create|Link body-combobox grammar) that says what committing a
 * row DOES. Rows stay one control; ↑↓ / Enter / click keep working unchanged.
 *
 * **It composes, it does not fork.** Addresses are minted by the same waist the
 * bin label printer uses — `POST /api/locations/register` via
 * {@link registerLocations} — so a row lands in `locations` with the canonical
 * flat barcode, idempotently. The sticker is the same {@link PrintLabel} card on
 * the same 3in × 2in `@page`. That format is load-bearing: it is the only one
 * `extractArrivalLocationBarcode` decodes, so a hand-typed barcode would make a
 * shelf you can pick but never scan.
 *
 * Placement runs through the port's own writer — at Arrival that is
 * `useTriageStaging.selectShelf`, so the lane auto-route and its manual-wins
 * rule are inherited. One storage per station; this leaf never writes across
 * them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Plus, Printer } from '@/components/Icons';
import { PrintLabel } from '@/components/barcode/bin-label-printer';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import { useDisplaysLeafChrome } from '@/components/station/displays';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { TabDisplay } from '@/design-system/components';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { parseLocationCodeFlat, type LocationSegments } from '@/lib/barcode-routing';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { StationNewLocationForm } from './StationNewLocationForm';
import type { StationLocationPlacementPort } from './station-location-port';

/** What committing a row does. `new` swaps the list for the create form. */
type LocationsMode = 'place' | 'print' | 'new';

const MODE_TABS = [
  { id: 'place', label: 'Place' },
  { id: 'print', label: 'Print' },
  { id: 'new', label: 'New' },
];

export function StationLocationsDisplay({
  port,
  onPlaced,
}: {
  port: StationLocationPlacementPort;
  /** Close the leaf once the entity is placed (nothing left to do here). */
  onPlaced?: () => void;
}) {
  const {
    locations,
    locationsLoading,
    placedLocationId,
    place: placeAt,
    entityNoun,
  } = port;
  const { identity: orgGs1 } = useOrgGs1();
  const { setLeafTrailing } = useDisplaysLeafChrome();

  const [mode, setMode] = useState<LocationsMode>('place');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printSegments, setPrintSegments] = useState<LocationSegments | null>(null);

  // The mode segment is leaf-wide chrome, so it rides the sticky header's
  // trailing slot — never a second band inside the body.
  useEffect(() => {
    setLeafTrailing(
      <TabDisplay
        tabs={MODE_TABS}
        activeTab={mode}
        onTabChange={(id) => setMode(id as LocationsMode)}
        appearance="segment"
        aria-label="What a shelf row does"
      />,
    );
    return () => setLeafTrailing(null);
  }, [mode, setLeafTrailing]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? locations.filter((l) =>
          [l.name, l.room, l.barcode]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : locations;
    return matched.map((l): StationArmedVerb => {
      const staged = l.id === placedLocationId;
      return {
        id: String(l.id),
        label: l.name,
        icon: MapPin,
        // One fact under the label — where it is and what you scan for it.
        subtitle: [l.room, l.barcode, staged ? `${entityNoun} is here` : null]
          .filter(Boolean)
          .join(' · '),
        // A shelf with no canonical barcode cannot be printed; it can still be
        // placed on, so only Print disables it.
        disabled:
          mode === 'print' && parseLocationCodeFlat((l.barcode ?? '').trim()) == null,
      };
    });
  }, [entityNoun, locations, mode, placedLocationId, query]);

  const place = useCallback(
    async (id: number, name: string) => {
      const ok = await placeAt(id);
      // The port already reported a failed write and rolled back — only claim
      // the placement when it actually landed.
      if (!ok) return;
      toast.success(`Staged → ${name}`);
      onPlaced?.();
    },
    [onPlaced, placeAt],
  );

  const print = useCallback(
    async (barcode: string | null, room: string | null) => {
      const segments = parseLocationCodeFlat((barcode ?? '').trim());
      if (!segments) {
        toast.error('That shelf has no printable address.');
        return;
      }
      try {
        // Register before print — an orphan sticker that scans to nothing is
        // worse than no sticker. Idempotent, so a reprint is a no-op write.
        await registerLocations(room || '', [segments]);
        port.refreshCatalog();
      } catch {
        // A reprint of an EXISTING shelf must not be blocked by a re-register
        // hiccup; the row is already in the table.
      }
      setPrintSegments(segments);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
          setTimeout(() => setPrintSegments(null), 250);
        });
      });
    },
    [port],
  );

  const commit = useCallback(
    (rowId: string) => {
      const loc = locations.find((l) => String(l.id) === rowId);
      if (!loc) return;
      setBusyId(rowId);
      const done = () => setBusyId(null);
      if (mode === 'print') void print(loc.barcode, loc.room).finally(done);
      else void place(loc.id, loc.name).finally(done);
    },
    [locations, mode, place, print],
  );

  const printRoom = useMemo(() => {
    if (!printSegments) return '';
    const flat = `${printSegments.zone}`;
    return (
      locations.find((l) => (l.barcode ?? '').startsWith(flat))?.room ?? ''
    );
  }, [locations, printSegments]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mode === 'new' ? (
        <StationNewLocationForm
          port={port}
          onPlaced={onPlaced}
          onCreated={() => setMode('place')}
        />
      ) : (
        <>
          <div className={cn('shrink-0 pt-2', DISPLAYS_BODY_INSET)}>
            <TechRailSearchBar
              variant="rail"
              value={query}
              onChange={setQuery}
              placeholder="Filter locations…"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {locationsLoading ? (
              <p
                className={cn(
                  'flex items-center gap-2 py-6 text-role-caption text-text-muted',
                  DISPLAYS_BODY_INSET,
                )}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading locations…
              </p>
            ) : rows.length === 0 ? (
              // Two empty answers, never one: a filter that excluded everything
              // is not the same as a warehouse with no shelves.
              <div
                className={cn(
                  'border border-dashed border-border-soft bg-surface-sunken inset-empty text-center text-role-caption text-text-muted',
                  DISPLAYS_BODY_INSET,
                )}
              >
                {query.trim() ? (
                  <>
                    No location matches “{query.trim()}”.
                    <button
                      type="button"
                      className="ml-1 underline"
                      onClick={() => setQuery('')}
                    >
                      Clear filter
                    </button>
                  </>
                ) : (
                  <>
                    No locations yet — switch to <strong>New</strong> to make
                    the first one.
                  </>
                )}
              </div>
            ) : (
              <StationArmedVerbList
                verbs={rows}
                onCommit={commit}
                listLabel={
                  mode === 'print'
                    ? 'Print a location label'
                    : `Place ${entityNoun} on a location`
                }
                testId="arrival-locations-list"
              />
            )}
          </div>

          <div
            className={cn(
              'shrink-0 border-t border-border-hairline py-2 text-role-caption text-text-muted',
              DISPLAYS_BODY_INSET,
            )}
          >
            {busyId ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Working…
              </span>
            ) : mode === 'print' ? (
              <span className="inline-flex items-center gap-1.5">
                <Printer className="h-3.5 w-3.5 shrink-0" />
                <span>Pick a location to reprint its label.</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {/* One text node — an inline-flex parent would otherwise make
                    every inline child a flex item and gap the sentence apart. */}
                <span>
                  Pick a location to place this {entityNoun}, or New to make
                  one.
                </span>
              </span>
            )}
          </div>
        </>
      )}

      {/* Print zone — hidden on screen, fills the 3in × 2in page on print. */}
      <div className="label-print-zone">
        {printSegments ? (
          <PrintLabel
            segments={printSegments}
            roomName={printRoom}
            gln={orgGs1?.gln ?? ''}
          />
        ) : null}
      </div>
    </div>
  );
}
