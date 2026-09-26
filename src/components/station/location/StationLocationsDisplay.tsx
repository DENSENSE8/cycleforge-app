'use client';

/** @domain-job Station Displays → **Locations** — browse the addresses this warehouse has, place the open entity on one, reprint a scuffed… */

import { useCallback, useMemo, useState } from 'react';
import { MapPin, Plus, Printer } from '@/components/Icons';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import { SearchField } from '@/design-system/primitives/SearchField';
import { SearchableSelectField } from '@/design-system/components';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { useAuth } from '@/contexts/AuthContext';
import { parseLocationCodeFlat } from '@/lib/barcode-routing';
import { printLocationLabelsJob } from '@/lib/print/printLocationLabel';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { PlacementSummary } from '@/components/receiving/PlacementSummary';
import { Button } from '@/design-system/primitives';
import { describePutawaySuggestion } from '@/lib/receiving/suggested-putaway-location';
import { StationNewLocationForm } from './StationNewLocationForm';
import type { StationLocationPlacementPort } from './station-location-port';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

/** What committing a row does. `new` swaps the list for the create form. */
type LocationsMode = 'place' | 'print' | 'new';

const MODE_IDS = ['place', 'print', 'new'] as const satisfies readonly LocationsMode[];

const MODE_OPTIONS = [
  { value: 'place', label: 'Place' },
  { value: 'print', label: 'Print' },
  { value: 'new', label: 'New' },
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
    suggestion = null,
    suggestionLoading = false,
  } = port;
  const { identity: orgGs1 } = useOrgGs1();
  const { user } = useAuth();

  const [mode, setMode] = useState<LocationsMode>('place');

  // ⌥1 / ⌥2 / ⌥3 still switch modes with the combobox closed — the chord
  // grammar belongs to the child mode, not to the control that paints it.
  useSegmentChords({
    enabled: true,
    tabIds: MODE_IDS,
    onTabChange: (id) => setMode(id as LocationsMode),
  });
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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
      await printLocationLabelsJob({
        segments: [segments],
        roomName: room || '',
        gln: orgGs1?.gln ?? '',
        orgSlug: user?.organizationSlug,
      });
    },
    [orgGs1?.gln, port, user?.organizationSlug],
  );

  /** Commit the DIRECTED target. */
  const placeSuggested = useCallback(() => {
    if (!suggestion) return;
    setBusyId(`suggested:${suggestion.location.id}`);
    void place(suggestion.location.id, suggestion.location.name).finally(() =>
      setBusyId(null),
    );
  }, [place, suggestion]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Row 2 — what committing a row does. */}
      <div className="shrink-0" data-testid="station-locations-mode-select">
        <SearchableSelectField
          appearance="flush"
          value={mode}
          onChange={(id) => {
            if (id == null) return;
            setMode(id as LocationsMode);
          }}
          options={MODE_OPTIONS}
          placeholder="Place, Print or New…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No modes match"
          ariaLabel="What a shelf row does"
        />
      </div>

      {mode === 'new' ? (
        <StationNewLocationForm
          port={port}
          onPlaced={onPlaced}
          onCreated={() => setMode('place')}
        />
      ) : (
        <>
          {/* Row 2b — the DIRECTED target. */}
          {mode === 'place' && (suggestion || suggestionLoading) ? (
            <div
              className={cn('shrink-0 border-b border-border-hairline py-2', DISPLAYS_BODY_INSET)}
              data-testid="station-locations-suggested-target"
            >
              {suggestion ? (
                <PlacementSummary
                  location={suggestion.location}
                  eyebrow={describePutawaySuggestion(suggestion).eyebrow}
                  footer={
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="min-w-0 text-role-caption text-text-muted">
                        {describePutawaySuggestion(suggestion).basis}
                      </p>
                      <Button
                        type="button"
                        variant="primarySoft"
                        size="sm"
                        disabled={
                          busyId != null ||
                          suggestion.location.id === placedLocationId
                        }
                        onClick={() => placeSuggested()}
                      >
                        {suggestion.location.id === placedLocationId
                          ? 'Already here'
                          : 'Place here'}
                      </Button>
                    </div>
                  }
                />
              ) : (
                <UniversalLoader
                  isLoading
                  label="Finding where this goes"
                  className="min-h-16"
                />
              )}
            </div>
          ) : null}

          {/* Row 3 — the same find face as the Root Index `Filter displays…` row and the Unbox workbench Band 3 (`variant="chrome"`, full width,… */}
          <div className="shrink-0 border-b border-border-hairline">
            <SearchField
              value={query}
              onChange={setQuery}
              onClear={() => setQuery('')}
              placeholder="Filter locations…"
              className="min-w-0 flex-1"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {locationsLoading ? (
              <UniversalLoader
                isLoading
                label="Loading locations"
                className="min-h-28"
              />
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
            {mode === 'print' ? (
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
    </div>
  );
}
