'use client';

/**
 * The Tasks board's small faces — people, due, ticket, the done ring.
 *
 * Colour is triage (owner 2026-09-29: bright, never washed out — the eye must
 * find the action before reading): orange = a ticket someone is waiting on,
 * red = late, amber-orange = due today, sky = soon, emerald = done. People
 * wear the SAME identity they wear on every station surface: `StaffAvatar`
 * for the mark, `StaffBadge` (station staff colour) for the name.
 */

import { Check, Clock, Send, Ticket } from 'lucide-react';
import type { TaskDeskPerson } from '@/lib/tasks/task-desk-row';
import {
  taskBoardDueFace,
  taskBoardFollowUpFace,
  type DueTone,
  type TaskBoardRepair,
  type TaskBoardRow,
  type TaskBoardTicket,
} from '@/lib/task-board/task-board-model';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import type { IdentityMarkSize } from '@/components/identity/IdentityMark';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { repairStatusFace } from '@/design-system/tokens/repair-status';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';

/** One staffer's mark — their photo or initials on their own staff colour. */
export function PersonDot({ person, size = 'xs' }: { person: TaskDeskPerson; size?: IdentityMarkSize }) {
  return <StaffAvatar staffId={person.id} name={person.name} size={size} />;
}

/** Up to `max` faces, overlapped; the rest as `+N`. */
export function PeopleStack({ people, max = 3 }: { people: readonly TaskDeskPerson[]; max?: number }) {
  if (people.length === 0) return <span className="text-[11px] text-text-muted">Unassigned</span>;
  return (
    <span className="flex items-center -space-x-1" aria-label={people.map((p) => p.name).join(', ')}>
      {people.slice(0, max).map((person) => (
        <PersonDot key={person.id} person={person} />
      ))}
      {people.length > max ? (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-sunken text-[9px] font-semibold text-text-muted ring-2 ring-surface-card">
          +{people.length - max}
        </span>
      ) : null}
    </span>
  );
}

/** Faces plus first names, each name in that staffer's station colour (`StaffBadge`). Nobody named = nothing: the row's type says who owes it. */
export function PeopleInline({ people }: { people: readonly TaskDeskPerson[] }) {
  if (people.length === 0) return null;
  const shown = people.length > 3 ? people.slice(0, 2) : people;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 items-center -space-x-1">
        {people.slice(0, 3).map((person) => (
          <PersonDot key={person.id} person={person} />
        ))}
      </span>
      <span className="truncate font-semibold">
        {shown.map((person, index) => (
          <span key={person.id}>
            {index > 0 ? <span className="text-text-muted">, </span> : null}
            <StaffBadge staffId={person.id} name={person.name.split(' ')[0]} />
          </span>
        ))}
        {people.length > 3 ? <span className="text-text-muted"> +{people.length - 2}</span> : null}
      </span>
    </span>
  );
}

/** 11px due text at WCAG AA (≥4.5:1 on the card): -700 inks in light, -300 in dark. */
const DUE_TONE_CLASS: Readonly<Record<DueTone, string>> = {
  late: 'font-bold text-red-700 dark:text-red-300',
  today: 'font-bold text-orange-700 dark:text-orange-300',
  // Owner 2026-09-29: tomorrow is urgent too — orange, never a calm blue.
  soon: 'font-semibold text-orange-700 dark:text-orange-300',
  calm: 'font-medium text-text-default',
};

/** Nothing when there is no due date — an empty dash is noise on a dense list. */
export function DueChip({ dueMs, nowMs, done }: { dueMs: number | null; nowMs: number; done: boolean }) {
  const face = taskBoardDueFace(dueMs, nowMs);
  if (!face) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] tabular-nums',
        done ? 'text-text-muted line-through' : DUE_TONE_CLASS[face.tone],
      )}
    >
      <Clock aria-hidden className="size-3" strokeWidth={2.5} />
      {face.label}
    </span>
  );
}

/** Line 2's chase face — `Chase Tomorrow` / `Followed up 2d ago` — in the due inks. */
export function FollowUpFace({ row, nowMs }: { row: TaskBoardRow; nowMs: number }) {
  const face = taskBoardFollowUpFace(row, nowMs);
  if (!face) return null;
  return (
    <span
      data-task-follow-up
      className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px]', DUE_TONE_CLASS[face.tone])}
    >
      <Send aria-hidden className="size-3" strokeWidth={2.5} />
      {face.label}
    </span>
  );
}

/**
 * The house ticket mark (UnfoundMatchStrip, MobileDailyRow): the Ticket glyph
 * in orange beside its number — icon-led, no fill — then the helpdesk status
 * as its colour pill. `glyph={false}` where the row already leads with the
 * Ticket glyph (the board row): one glyph per row.
 */
export function TicketChip({ ticket, glyph = true }: { ticket: TaskBoardTicket; glyph?: boolean }) {
  return (
    <span className="inline-flex max-w-[14rem] shrink-0 items-center gap-1 text-[11px]">
      {glyph ? <Ticket aria-label="Ticket" className="size-3.5 shrink-0 text-orange-600 dark:text-orange-400" strokeWidth={2.25} /> : null}
      <span className="font-bold tabular-nums text-orange-700 dark:text-orange-300">
        {ticket.number != null ? `#${ticket.number}` : 'Ticket'}
      </span>
      <TicketStatusPill status={ticket.status} />
    </span>
  );
}

/**
 * A repair ticket on a board row (owner 2026-09-30: repairs are support
 * tickets): its in-store number in the ticket ink, then the repair's stored
 * status as its colour pill — the same tone the Repair desk card wears
 * (`repairStatusFace`).
 */
export function RepairChip({ repair }: { repair: TaskBoardRepair }) {
  const face = repairStatusFace(repair.status);
  const tone = STATE_TONE_CLASSES[face.tone];
  const stamped = repair.ticketNumber?.trim().replace(/^#/, '') || `RS-${repair.id}`;
  const status = repairStatusOperatorLabel(face.label);
  return (
    <span data-repair-id={repair.id} className="inline-flex min-w-0 items-center gap-1 text-[11px]">
      <span className="shrink-0 whitespace-nowrap font-bold tabular-nums text-orange-700 dark:text-orange-300">
        Repair {/^\d+$/.test(stamped) ? `#${stamped}` : stamped}
      </span>
      <span
        data-repair-status={face.id}
        title={status}
        className={cn(
          'min-w-0 truncate rounded-full px-1.5 leading-4 ring-1 ring-inset',
          microBadge,
          tone.pill,
          tone.ring,
        )}
      >
        {status}
      </span>
    </span>
  );
}

/** The done ring — springs to a filled emerald check. Emerald-600, not -500: the fill and its white check stay ≥3:1 on the card in both themes. */
export function DoneRing({
  done,
  disabled,
  onToggle,
  label,
}: {
  done: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        'relative inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        done ? 'border-emerald-600 bg-emerald-600' : 'border-border-strong hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <motion.span
        initial={false}
        animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 28 }}
        className="flex"
      >
        <Check aria-hidden className="size-3 text-white" strokeWidth={3.5} />
      </motion.span>
    </button>
  );
}
