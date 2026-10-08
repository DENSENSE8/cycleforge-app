'use client';

/**
 * Set ship-by — the Records dock's day form in the strip's centered dialog
 * (operator 2026-10-08): the month is open with today focused; Enter or a tap
 * on a day sets it, Clear ship-by takes it off, and a landed write turns the
 * dialog to its done face.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/design-system/primitives/Button';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';

export function ShipByDialog({
  caption,
  onPick,
  done,
}: {
  /** What the write touches — "Ship-by for 3 outbound lines". */
  caption: string;
  /** The write (`null` clears); resolves true when any line took it (refusals toast their own words). */
  onPick: (day: Date | null) => Promise<boolean>;
  done: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ day: Date | null } | null>(null);

  const pick = async (day: Date | null) => {
    if (saving) return;
    setSaving(true);
    try {
      if (await onPick(day)) setSaved({ day });
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <VerbDoneState
        title={saved.day ? 'Ship-by set' : 'Ship-by cleared'}
        detail={saved.day ? format(saved.day, 'EEE, MMM d') : undefined}
        onDone={done}
        testId="records-ship-by-done"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="records-ship-by">
      <p className="text-role-caption text-text-soft">{caption}</p>
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto">
        <Calendar
          mode="single"
          autoFocus
          numberOfMonths={1}
          defaultMonth={new Date()}
          disabled={saving}
          onSelect={(day) => {
            if (day) void pick(day);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <p className="text-center text-role-micro text-text-soft">Enter on a day sets it</p>
        <Button type="button" variant="ghost" size="sm" className="w-full" disabled={saving} onClick={() => void pick(null)} data-testid="records-ship-by-clear">
          Clear ship-by
        </Button>
      </div>
    </div>
  );
}
