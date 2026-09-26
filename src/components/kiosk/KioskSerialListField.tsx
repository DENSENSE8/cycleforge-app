'use client';

/**
 * KioskSerialListField — every serial number on ONE repair unit.
 *
 * One unit can carry several (operator 2026-09-25: a Wave system and its CD
 * changer — "multiple endless serial numbers"). More UNITS is still the card's
 * `−  N  +`; more SERIALS on one unit is this field's `+ Add serial`, with no
 * upper limit, and a × on every extra field.
 *
 * The unit's serials travel as ONE string (`serial-list.ts`): this field keeps
 * a local DRAFT list so a just-added empty field survives (the stored string
 * drops blanks), and emits `joinSerials(draft)` on every keystroke. When the
 * stored value changes from OUTSIDE — a serial scanned on the phone companion
 * — the draft is re-synced without disturbing the field being typed in: fields
 * whose serials are still stored stay put (blanks included), new serials fill
 * a blank field first, then append.
 *
 * The FIRST field keeps the caller's name and `testId`, so every existing
 * target (`kiosk-repair-serial`, `kiosk-line-serial`) still addresses it.
 *
 * Callers: `KioskRepairPane` (Device & quote), `KioskCartLineEditor`,
 * `KioskHistoryDetail` (edit). Affected API: none. Schemas: none.
 */

import { useState } from 'react';
import { Plus, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { joinSerials, splitSerials } from '@/lib/kiosk/serial-list';

const EXTRA_FIELD_NAME = 'Another serial';

function draftFrom(value: string): string[] {
  const serials = splitSerials(value);
  return serials.length > 0 ? serials : [''];
}

/**
 * The draft after `value` changed under it. A field stays when every serial
 * it holds is still stored (a blank one always stays); stored serials no field
 * holds fill blank fields first, then append.
 */
export function resyncDraft(draft: readonly string[], value: string): string[] {
  const stored = splitSerials(value);
  const storedKeys = new Set(stored.map((s) => s.toUpperCase()));
  const kept = draft.filter((entry) =>
    splitSerials(entry).every((s) => storedKeys.has(s.toUpperCase())),
  );
  const heldKeys = new Set(kept.flatMap((entry) => splitSerials(entry)).map((s) => s.toUpperCase()));
  const missing = stored.filter((s) => !heldKeys.has(s.toUpperCase()));
  const next = kept.map((entry) => (entry.trim() === '' && missing.length > 0 ? missing.shift()! : entry));
  next.push(...missing);
  return next.length > 0 ? next : [''];
}

export function KioskSerialListField({
  name,
  value,
  onChange,
  idScope,
  testId,
  onEnter,
}: {
  /** The FIRST field's name — `Serial number`, or `Serial number 2` for a later unit. */
  name: string;
  /** The unit's stored serials, `joinSerials` form. */
  value: string;
  onChange: (value: string) => void;
  /** Disambiguates DOM ids when the field repeats on one screen (one per unit). */
  idScope: string;
  /** The FIRST field's test id; extras and controls derive from it. */
  testId?: string;
  /** Return key in any field — the step's own finish, never "add a field". */
  onEnter?: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(() => draftFrom(value));
  const [seenValue, setSeenValue] = useState(value);
  /** The field `+ Add serial` just opened — focused on mount, nothing else is. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // Adjust-state-on-prop-change: our own writes come back equal to the draft's
  // join and change nothing; only an outside write re-syncs.
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== joinSerials(draft)) {
      setDraft(resyncDraft(draft, value));
      setFocusIndex(null);
    }
  }

  const write = (next: string[]) => {
    setDraft(next);
    onChange(joinSerials(next));
  };

  return (
    <div className="flex flex-col gap-2" data-testid={testId ? `${testId}-list` : undefined}>
      {draft.map((serial, i) => {
        const field = (
          <KioskEntryField
            name={i === 0 ? name : EXTRA_FIELD_NAME}
            idScope={i === 0 ? idScope : `${idScope}-${i}`}
            value={serial}
            onChange={(next) => write(draft.map((s, j) => (j === i ? next : s)))}
            testId={testId ? (i === 0 ? testId : `${testId}-extra-${i}`) : undefined}
            onEnter={onEnter}
            autoFocus={i === focusIndex}
          />
        );
        if (i === 0) return <div key={i}>{field}</div>;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{field}</div>
            <IconButton
              icon={<X className="h-5 w-5" aria-hidden />}
              ariaLabel={`Remove serial ${i + 1}`}
              size="touch"
              onClick={() => {
                setFocusIndex(null);
                write(draft.filter((_, j) => j !== i));
              }}
              data-testid={testId ? `${testId}-remove-${i}` : undefined}
            />
          </div>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        icon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => {
          setFocusIndex(draft.length);
          setDraft([...draft, '']);
        }}
        data-testid={testId ? `${testId}-add` : undefined}
      >
        Add serial
      </Button>
    </div>
  );
}
