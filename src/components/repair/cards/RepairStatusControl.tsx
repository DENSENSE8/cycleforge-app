'use client';

/**
 * The repair card's STATUS, as a control (owner 2026-09-29): the stored
 * status in its tone on line 1, beside the SLA; a click (or Enter / Space on
 * it) opens the house anchored list (`AnchoredLayer`) of the repair statuses.
 * Typing filters, ↑ / ↓ move, Enter picks, Esc closes and hands focus back to
 * the chip. Picking calls `onPick`; the host writes it through the one status
 * writer. Cancel is not offered — it asks for a reason on the record.
 */

import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { REPAIR_STATUS, repairStatusFace } from '@/design-system/tokens/repair-status';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { cn } from '@/utils/_cn';

/** Every stored status the card offers, in workflow order — Cancel lives on the record (it takes a reason). */
const CHOICES = Object.values(REPAIR_STATUS)
  .filter((face) => face.id !== 'Cancelled')
  .map((face) => ({ status: face.id, label: repairStatusOperatorLabel(face.id), tone: face.tone }));

type Choice = (typeof CHOICES)[number];

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function RepairStatusControl({
  status,
  onPick,
  testId,
}: {
  /** The stored status (`repair_service.status`). */
  status: string;
  /** Only called with a status that differs from `status`. */
  onPick: (next: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const face = repairStatusFace(status);
  const label = repairStatusOperatorLabel(face.label);
  const tone = STATE_TONE_CLASSES[face.tone];
  return (
    // Clicks and pointers stay here — the card behind must not open (React events
    // bubble out of the portaled list through this node too). Keys pass: Esc
    // closes the list from its window listener.
    <span className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto')} onClick={stop} onPointerDown={stop}>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${label}. Change status`}
        data-testid={testId}
        data-status={status}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          'ds-raw-button inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-[13px] font-medium transition-colors hover:bg-surface-sunken',
          tone.text,
          focusRing('control'),
        )}
      >
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone.dot)} />
        {label}
        <ChevronDown aria-hidden className="size-3.5 text-text-muted" />
      </button>
      <AnchoredLayer open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-end" level="panelPopover" gap={4}>
        {/* Remounted per open: the filter and the highlight start fresh. */}
        {open ? (
          <RepairStatusList
            current={status}
            testId={`${testId}-menu`}
            onPick={(next) => {
              setOpen(false);
              if (next !== status) onPick(next);
            }}
          />
        ) : null}
      </AnchoredLayer>
    </span>
  );
}

/** The statuses as a filterable list — the card's anchored menu and the record's Change status panel. */
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
