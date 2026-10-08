'use client';

/**
 * Move rack — the rack record's centered picker dialog (operator 2026-10-08),
 * the phone's two-scan flow on the desk. The rack is already in hand (its
 * record); the search is open and focused over every room and floor spot:
 * scan (wedge) or type the destination label, Enter moves it. A scanned code
 * that matches no listed placement still goes to the server, which validates
 * it like a scan (`destination_not_found` / `destination_kind`). Only the
 * rack's placement changes — no reprint. Undo (move back to where it stood,
 * new client event id) rides the toast.
 */

import { useMemo, useState } from 'react';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { useLocations } from '@/hooks/useLocations';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import { rackErrorMessage, rackPlacementText } from '@/lib/locations/rack-display';
import type { MoveRackResponse, RackDetail } from '@/lib/locations/rack-types';
import { moveRack } from '@/lib/locations/racks-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';

/** A typed / scanned code no listed placement carries — the server validates it. */
const TYPED_PREFIX = 'code:';

export function RackMoveDialog({
  rack,
  onMoved,
  done,
}: {
  rack: RackDetail;
  /** After a move or its undo — the host refreshes the rack and the list. */
  onMoved: (next: RackDetail) => void;
  done: () => void;
}) {
  const { locations, loading } = useLocations();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  // The done face: where the rack now stands, until the operator taps Done (or Enter).
  const [moved, setMoved] = useState<MoveRackResponse | null>(null);

  const placements = useMemo(
    () =>
      locations
        .filter((l) => (l.location_kind === 'ROOM' || l.location_kind === 'STAGING') && l.id !== rack.placement.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [locations, rack.placement.id],
  );

  const code = unwrapScannedLocation(query).toUpperCase();
  const options = useMemo(() => {
    const matches = placements.filter(
      (l) => !code || l.barcode?.toUpperCase().includes(code) || (l.display_name || l.name).toUpperCase().includes(code),
    );
    const listed = matches.map((l) => ({
      value: String(l.id),
      label: (l.display_name || l.name) + (l.location_kind === 'STAGING' ? ' · floor spot' : ''),
      meta: l.barcode ?? undefined,
    }));
    const exact = matches.some((l) => l.barcode?.toUpperCase() === code);
    return code && !exact ? [...listed, { value: `${TYPED_PREFIX}${code}`, label: `Move to ${code}`, meta: 'Scanned code', mono: true }] : listed;
  }, [code, placements]);

  const move = async (value: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await moveRack(rack.code, {
        ...(value.startsWith(TYPED_PREFIX) ? { destinationCode: value.slice(TYPED_PREFIX.length) } : { destinationId: Number(value) }),
        clientEventId: safeRandomUUID(),
      });
      onMoved(res.rack);
      setMoved(res);
      toast.undo(`${rack.name} moved to ${res.to.name}`, {
        onUndo: () => {
          void moveRack(rack.code, { destinationId: res.from.id, clientEventId: safeRandomUUID() })
            .then((back) => {
              onMoved(back.rack);
              toast.success(`${rack.name} is back at ${back.to.name}`);
            })
            .catch((err: unknown) => toast.error(rackErrorMessage(err)));
        },
      });
    } catch (err) {
      toast.error(rackErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (moved) {
    return (
      <VerbDoneState
        title="Rack moved"
        detail={`${rack.name} · ${moved.from.name} → ${moved.to.name} · labels unchanged`}
        onDone={done}
        testId="rack-move-done"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="rack-move">
      <p className="text-role-caption text-text-soft">
        <span className="font-mono text-text-default">{rack.code}</span> · stands at {rackPlacementText(rack)}
      </p>
      <IntakeCombobox
        surface="open"
        value={null}
        onChange={(value) => void move(value)}
        options={options}
        query={query}
        onQueryChange={setQuery}
        loading={loading}
        placeholder="Room or floor spot"
        searchPlaceholder="Scan or type the room or floor label…"
        emptyMessage="No room or floor spot"
        disabled={busy}
        ariaLabel={`Move ${rack.name} to a room or floor spot`}
        testId="rack-move-destination"
        className="flex-1"
      />
    </div>
  );
}
