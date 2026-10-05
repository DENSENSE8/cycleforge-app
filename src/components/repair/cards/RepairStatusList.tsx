'use client';

/**
 * The repair statuses as a filterable list (owner 2026-09-29) — the record's
 * Change status panel and the check-set strip's. Typing filters, ↑ / ↓ move,
 * Enter picks. Picking calls `onPick`; the host writes it through the one
 * status writer. Cancel is not offered — it asks for a reason on the record.
 * The card no longer carries a status control (owner 2026-10-04): its status
 * is the rail and glyph, changed on the open record.
 */

import { useMemo, useState } from 'react';
import { Check } from '@/components/Icons';
import { Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { REPAIR_STATUS } from '@/design-system/tokens/repair-status';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { cn } from '@/utils/_cn';

/** Every stored status the list offers, in workflow order — Cancel lives on the record (it takes a reason). */
const CHOICES = Object.values(REPAIR_STATUS)
  .filter((face) => face.id !== 'Cancelled')
  .map((face) => ({ status: face.id, label: repairStatusOperatorLabel(face.id), tone: face.tone }));

type Choice = (typeof CHOICES)[number];
/** The statuses as a filterable list. */
export function RepairStatusList({ current, testId, onPick }: { current: string; testId: string; onPick: (next: string) => void }) {
  const [find, setFind] = useState('');
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? CHOICES.filter((choice) => choice.label.toLowerCase().includes(q) || choice.status.toLowerCase().includes(q)) : CHOICES;
  }, [find]);
  const [highlight, setHighlight] = useState(() => Math.max(0, CHOICES.findIndex((choice) => choice.status === current)));
  const active: Choice | null = matches[Math.min(highlight, matches.length - 1)] ?? null;
  return (
    <Panel padding="none" radius="xl" elevation="overlay" role="menu" aria-label="Set repair status" data-testid={testId} className="flex w-64 flex-col gap-0.5 p-1.5">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the list opened from a click; typing filters at once
        autoFocus
        value={find}
        aria-label="Filter statuses"
        placeholder="Set status…"
        onChange={(event) => {
          setFind(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : matches.length - 1;
            setHighlight((at) => (Math.min(at, matches.length - 1) + step) % Math.max(1, matches.length));
          } else if (event.key === 'Enter' && active) {
            event.preventDefault();
            onPick(active.status);
          }
        }}
        className={cn('mb-0.5 h-8 rounded-lg bg-surface-sunken px-2.5 text-xs text-text-default placeholder:text-text-muted', focusRing('field'))}
      />
      {matches.map((choice) => (
        <button
          key={choice.status}
          type="button"
          role="menuitemradio"
          aria-checked={choice.status === current}
          data-testid={`${testId}-${choice.status}`}
          onPointerMove={() => setHighlight(matches.indexOf(choice))}
          onClick={() => onPick(choice.status)}
          className={cn(
            'ds-raw-button flex h-8 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-text-default',
            choice === active ? 'bg-surface-hover' : null,
          )}
        >
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATE_TONE_CLASSES[choice.tone].dot)} />
          <span className="min-w-0 flex-1 truncate">{choice.label}</span>
          {choice.status === current ? <Check aria-label="Current status" className="size-3.5 text-text-muted" /> : null}
        </button>
      ))}
      {matches.length === 0 ? <p className="px-2 py-1 text-xs text-text-muted">No status matches</p> : null}
    </Panel>
  );
}
