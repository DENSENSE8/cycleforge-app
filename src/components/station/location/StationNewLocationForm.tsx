'use client';

/** @domain-job Station Displays → Locations → **New** — mint a scannable address, print its sticker, and (where the storage allows it) put… */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Printer } from '@/components/Icons';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { SELECT_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { Button } from '@/design-system/primitives';
import { FlushTerminalFooter } from '@/design-system/primitives/FlushTerminalFooter';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { useAuth } from '@/contexts/AuthContext';
import { locationCode, type LocationSegments } from '@/lib/barcode-routing';
import { printLocationLabelsJob } from '@/lib/print/printLocationLabel';
import {
  printableRoomNames,
  suggestNextPosition,
  zoneLetterForRoom,
} from '@/lib/receiving/arrival-new-location';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { StationLocationPlacementPort } from './station-location-port';

const FIELD_CLASS = cn(
  'h-8 w-full min-w-0 rounded-none border border-border-soft bg-surface-card',
  'inset-field text-role-caption tabular-nums text-text-default',
  focusRing('field', 'accent'),
);

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-role-eyebrow text-text-soft">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, Math.floor(next))));
        }}
        className={FIELD_CLASS}
      />
    </label>
  );
}

export function StationNewLocationForm({
  port,
  onPlaced,
  onCreated,
}: {
  port: StationLocationPlacementPort;
  /** Close the leaf once the entity is on the new spot (nothing left to do). */
  onPlaced?: () => void;
  /** Hand the operator back to the list after an address is minted. */
  onCreated?: () => void;
}) {
  const { rooms, loading: roomsLoading } = useLocations();
  const { identity: orgGs1 } = useOrgGs1();
  const { user } = useAuth();
  const { locations, place: placeAt, refreshCatalog, canPlaceMinted } = port;

  const roomNames = useMemo(() => printableRoomNames(rooms), [rooms]);
  const [room, setRoom] = useState('');
  const [aisle, setAisle] = useState(1);
  const [bay, setBay] = useState(1);
  const [level, setLevel] = useState(1);
  const [position, setPosition] = useState(1);
  const [busy, setBusy] = useState(false);

  // Seed the room once the catalog lands; the operator can change it.
  useEffect(() => {
    if (!room && roomNames.length > 0) setRoom(roomNames[0]);
  }, [room, roomNames]);

  const zone = useMemo(() => zoneLetterForRoom(rooms, room), [rooms, room]);

  // Re-suggest the free slot whenever the level changes — never hand back an
  // address that is already physically occupied.
  const suggested = useMemo(
    () => (zone ? suggestNextPosition(locations, { zone, aisle, bay, level }) : null),
    [locations, zone, aisle, bay, level],
  );
  useEffect(() => {
    if (suggested != null) setPosition(suggested);
  }, [suggested]);

  const segments: LocationSegments | null = zone
    ? { zone, aisle, bay, level, position }
    : null;
  const code = segments ? locationCode(segments) : null;
  const levelFull = zone != null && suggested == null;

  const createAndPlace = useCallback(async () => {
    if (!segments || !room) return;
    setBusy(true);
    try {
      const bins = await registerLocations(room, [segments]);
      const created = bins[0];
      if (!created?.id) {
        toast.error('The shelf was registered but returned no row — try again.');
        return;
      }
      // The catalog predates this shelf by definition — refresh it, or the dock
      // picker and shelf summary will read "Select a shelf…" beside a staged
      // carton.
      refreshCatalog();
      const ok = await placeAt(created.id);
      // The port already reported a failed write and rolled back; only claim
      // the placement when it actually landed.
      if (!ok) return;
      toast.success(`Created ${created.name} · ${port.entityNoun} staged`);
      onCreated?.();
      onPlaced?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not create that location.',
      );
    } finally {
      setBusy(false);
    }
  }, [onCreated, onPlaced, placeAt, port.entityNoun, refreshCatalog, room, segments]);

  const printSticker = useCallback(async () => {
    if (!segments || !room) return;
    setBusy(true);
    try {
      // Register BEFORE print — an orphan sticker that scans to nothing is
      // worse than no sticker (the printer flows hold the same line).
      await registerLocations(room, [segments]);
      refreshCatalog();
      await printLocationLabelsJob({
        segments: [segments],
        roomName: room,
        gln: orgGs1?.gln ?? '',
        orgSlug: user?.organizationSlug,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not register the label.',
      );
    } finally {
      setBusy(false);
    }
  }, [orgGs1?.gln, refreshCatalog, room, segments, user?.organizationSlug]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('min-h-0 flex-1 overflow-y-auto py-3', DISPLAYS_BODY_INSET)}>
        <div className="space-y-3">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-role-eyebrow text-text-soft">
              Room
            </span>
            <select
              className={SELECT_CLASS}
              value={room}
              disabled={roomsLoading}
              onChange={(e) => setRoom(e.target.value)}
              aria-label="Room"
            >

              {roomNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-4 gap-2">
            <NumberField label="Aisle" value={aisle} onChange={setAisle} />
            <NumberField label="Bay" value={bay} onChange={setBay} />
            <NumberField label="Level" value={level} onChange={setLevel} />
            <NumberField label="Slot" value={position} onChange={setPosition} />
          </div>

          {/* Honest absence: a room that has never been printed has no zone
              letter, and one cannot be invented — the barcode would decode to
              another zone's shelf. */}
          {!roomsLoading && room && !zone ? (
            <p className="border border-dashed border-amber-200 bg-surface-sunken inset-empty text-role-caption text-amber-800">
              “{room}” has no zone letter yet, so a scannable address can’t be
              minted here. Give the room a zone letter in Inventory → Locations,
              then come back.
            </p>
          ) : null}

          {levelFull ? (
            <p className="border border-dashed border-amber-200 bg-surface-sunken inset-empty text-role-caption text-amber-800">
              Every slot on this level is taken — move to the next level or bay.
            </p>
          ) : null}

          {code ? (
            <div className="border border-border-soft bg-surface-sunken inset-card">
              <p className="text-role-eyebrow text-text-soft">
                New location
              </p>
              <p className="mt-1 font-mono text-role-title tabular-nums text-text-default">
                {code}
              </p>
              <p className="mt-1 text-role-caption text-text-muted">
                {room} · scannable once the sticker is on the shelf
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <FlushTerminalFooter
        leading={
          null
        }
      >
        <Button
          // With no Create & place (pack desks), minting the sticker IS the
          // commit — it must not read as the quiet option next to nothing.
          variant={canPlaceMinted ? 'secondary' : 'primary'}
          onClick={() => void printSticker()}
          disabled={busy || !segments}
        >
          <Printer className="h-4 w-4" />
          Print label
        </Button>
        {canPlaceMinted ? (
          <Button
            variant="primary"
            onClick={() => void createAndPlace()}
            disabled={busy || !segments}
          >
            <MapPin className="h-4 w-4" />
            Create &amp; place
          </Button>
        ) : null}
      </FlushTerminalFooter>
    </div>
  );
}
