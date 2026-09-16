'use client';

/**
 * `/m/print` location ladder — room → aisle → bays → levels.
 *
 * The four steps a BIN or BAY run walks to derive its code. Extracted from
 * MobilePrintWorkspace when the tote grain landed: a tote has no ladder at all
 * (its code is a database serial), so keeping four location-only steps inline
 * in the host made the host mostly about the family it is not printing.
 *
 * Callers: MobilePrintWorkspace. Pure presentation — every piece of state is
 * owned by the host's draft.
 */

import { Button } from '@/design-system/primitives';
import {
  FILTER_DROPDOWN_LABEL_CLASS,
  FILTER_DROPDOWN_SELECT_CLASS,
} from '@/design-system/components/FilterDropdownSelect';
import { BAY_CHIP_COUNT, type BayParity } from '@/lib/print/expand-print-run';
import { cn } from '@/utils/_cn';

export type MobilePrintRoomOption = {
  id: number | string;
  name: string;
  letter: string;
};

export function MobilePrintRoomStep({
  rooms,
  loading,
  selectedRoom,
  chipClass,
  onPick,
}: {
  rooms: readonly MobilePrintRoomOption[];
  loading: boolean;
  selectedRoom: string;
  chipClass: (on: boolean) => string;
  onPick: (name: string, letter: string) => void;
}) {
  return (
    <>
      {loading && <p className="text-role-caption text-text-soft">Loading rooms…</p>}
      {rooms.map((room) => {
        // A room with no zone letter cannot mint a code, so it is shown and
        // disabled rather than hidden — an operator hunting a missing room
        // needs to see that it exists and why it cannot be picked.
        const ok = /^[A-Z]$/.test(room.letter);
        return (
          <Button
            key={room.id}
            type="button"
            variant="secondary"
            radius="surface"
            disabled={!ok}
            className={cn('h-14 w-full justify-between', chipClass(selectedRoom === room.name))}
            onClick={() => ok && onPick(room.name, room.letter)}
          >
            <span>{room.name}</span>
            <span className="font-mono">{ok ? room.letter : 'No zone'}</span>
          </Button>
        );
      })}
    </>
  );
}

export function MobilePrintBaysStep({
  parity,
  selectedBays,
  chipClass,
  onParity,
  onToggleBay,
}: {
  parity: BayParity;
  selectedBays: readonly number[];
  chipClass: (on: boolean) => string;
  onParity: (parity: BayParity) => void;
  onToggleBay: (n: number) => void;
}) {
  return (
    <>
      <p className="text-role-caption text-text-muted">
        Odds left · Evens right. Select every bay to print.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {(['all', 'odds', 'evens'] as const).map((id) => (
          <Button
            key={id}
            type="button"
            variant="secondary"
            radius="surface"
            className={chipClass(parity === id)}
            onClick={() => onParity(id)}
          >
            {id === 'all' ? 'All' : id === 'odds' ? 'Odds' : 'Evens'}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: BAY_CHIP_COUNT }, (_, i) => i + 1).map((n) => (
          <Button
            key={n}
            type="button"
            variant="secondary"
            radius="surface"
            className={chipClass(selectedBays.includes(n))}
            onClick={() => onToggleBay(n)}
          >
            {n}
          </Button>
        ))}
      </div>
    </>
  );
}

export function MobilePrintLevelsStep({
  bays,
  bayLevels,
  maxLevels,
  onLevel,
}: {
  bays: readonly number[];
  bayLevels: Record<number, number>;
  maxLevels: number;
  onLevel: (bay: number, level: number) => void;
}) {
  return (
    <>
      <p className="text-role-caption text-text-muted">Height per bay — one column.</p>
      {bays.map((bay) => (
        <label key={bay} className="block">
          <span className={FILTER_DROPDOWN_LABEL_CLASS}>Bay {bay}</span>
          <select
            className={cn(FILTER_DROPDOWN_SELECT_CLASS, 'text-role-field')}
            value={bayLevels[bay] ?? maxLevels}
            onChange={(e) => onLevel(bay, Number(e.target.value))}
          >
            {Array.from({ length: maxLevels }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} level{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
      ))}
    </>
  );
}
