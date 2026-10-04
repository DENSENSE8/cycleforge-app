'use client';

/**
 * Where a rack can stand — every ROOM and STAGING (floor spot) row of the org,
 * read from the one location list (`useLocations`, GET /api/locations). The
 * manual-pick fallback beside a scan in New rack › Place and Move rack; the
 * server validates the picked id exactly like a scanned label.
 */

import { useMemo } from 'react';
import { useLocations } from '@/hooks/useLocations';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import type { RackPlacementKind, RackPlacementRef } from '@/lib/locations/rack-types';

export interface RackPlacementChoice extends RackPlacementRef {
  /** The room a floor spot stands in; null for a room. */
  roomName: string | null;
}

const PLACEMENT_KINDS: Readonly<Record<string, true>> = { ROOM: true, STAGING: true } satisfies Record<RackPlacementKind, true>;

/** Rooms first in list order, each followed by its floor spots. */
export function useRackPlacements() {
  const { locations, loading, error } = useLocations();
  const choices = useMemo(() => {
    const rows = locations.filter((row) => row.is_active !== false && PLACEMENT_KINDS[row.location_kind ?? ''] === true);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const out: RackPlacementChoice[] = rows.map((row) => ({
      id: row.id,
      code: row.barcode?.trim() || null,
      name: row.display_name?.trim() || row.name,
      kind: row.location_kind as RackPlacementKind,
      roomName: row.location_kind === 'STAGING' && row.parent_id != null ? byId.get(row.parent_id)?.name ?? null : null,
    }));
    return out.sort((a, b) => {
      const roomA = a.roomName ?? a.name;
      const roomB = b.roomName ?? b.name;
      if (roomA !== roomB) return roomA.localeCompare(roomB);
      if (a.kind !== b.kind) return a.kind === 'ROOM' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [locations]);
  /** A scanned label → its placement row, or null when the label is no room / floor spot. */
  const match = (scanned: string): RackPlacementChoice | null => {
    const code = unwrapScannedLocation(scanned).trim().toUpperCase();
    return choices.find((choice) => choice.code?.toUpperCase() === code) ?? null;
  };
  return { choices, match, loading, error: error?.message ?? null };
}

export function RackPlacementChoices({
  choices,
  loading,
  error,
  currentId,
  label,
  onChoose,
}: {
  choices: readonly RackPlacementChoice[];
  loading: boolean;
  error: string | null;
  /** The placement already chosen (or where the rack stands now) — painted selected. */
  currentId: number | null;
  label: string;
  onChoose: (choice: RackPlacementChoice) => void;
}) {
  if (loading) return <p className="break-words px-mode-page py-6 text-center text-role-caption text-text-muted">Loading rooms…</p>;
  if (error) return <p role="alert" className="break-words px-mode-page py-6 text-center text-role-caption font-semibold text-text-danger">{`Could not load rooms (${error})`}</p>;
  if (choices.length === 0) return <p className="break-words px-mode-page py-6 text-center text-role-caption text-text-muted">No rooms or floor spots yet.</p>;
  return (
    <MobileRecordCardList label={label}>
      {choices.map((choice) => (
        <MobileRecordCard
          key={choice.id}
          identity={choice.kind === 'ROOM' ? 'Room' : 'Floor spot'}
          title={choice.name}
          detail={choice.roomName}
          status={choice.code}
          selected={currentId === choice.id}
          onOpen={() => onChoose(choice)}
          testId="rack-placement-choice"
        />
      ))}
    </MobileRecordCardList>
  );
}
