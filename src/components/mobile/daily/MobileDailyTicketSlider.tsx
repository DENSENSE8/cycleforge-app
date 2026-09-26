'use client';

/**
 * The ticket chip slider — how a phone links a daily task to a helpdesk ticket.
 * second search box to fill in (operator ruling 2026-09-15).
 */

import { Ticket } from '@/components/Icons';
import { MOBILE_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  useDailyTicketCandidates,
  type DailyTicketOption,
} from '@/lib/daily-checks/use-daily-ticket-candidates';

/**
 * `scrollbar-hide` is the house utility (`app/globals.css`) — a phone scroll
 * rail shows position by moving, not by painting a bar. `snap-mandatory` keeps
 * a half-scrolled chip off the edge, so the thumb always lands on a whole one.
 */
const TRACK_CLASS =
  'flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 scrollbar-hide';

const CHIP_BASE = cn(
  'ds-raw-button flex min-h-11 max-w-xs shrink-0 snap-start items-center gap-2 border px-3 text-left',
  'transition-colors duration-100 ease-out',
  MOBILE_CONTROL_CORNER,
  focusRing('control', 'accent'),
);

/**
 * Selected = the TabSwitch active face (`bg-surface-inverse` / `text-text-inverse`)
 * — the same white-on-black this surface already uses for "the one you picked",
 * so cadence and ticket read as one selection language.
 */
const CHIP_SELECTED = 'border-border-inverse bg-surface-inverse text-text-inverse';
const CHIP_IDLE = 'border-border-hairline bg-surface-card text-text-default';

const QUIET_LINE_CLASS = 'px-1 py-2 text-role-micro text-text-muted';

function TicketChip({
  option,
  selected,
  onSelect,
}: {
  option: DailyTicketOption;
  selected: boolean;
  onSelect: (ticketId: string) => void;
}) {
  const id = String(option.id);
  return (
    <button
      type="button"
      // A mis-tap is reversible: the selected chip is its own clear.
      onClick={() => onSelect(selected ? '' : id)}
      aria-pressed={selected}
      aria-label={`Ticket ${id}${option.subject ? `: ${option.subject}` : ''}`}
      className={cn(CHIP_BASE, selected ? CHIP_SELECTED : CHIP_IDLE)}
    >
      {/*
 * ALWAYS orange (operator 2026-09-15:
 * ALWAYS orange (operator 2026-09-15: "ticket icon should always display
 */}
      <Ticket className="h-4 w-4 shrink-0 text-text-warning" />
      <span className="shrink-0 text-role-data font-semibold tabular-nums">#{id}</span>
      {option.subject ? (
        <span
          className={cn(
            'min-w-0 truncate text-role-micro',
            selected ? 'text-text-inverse-soft' : 'text-text-muted',
          )}
        >
          {option.subject}
        </span>
      ) : null}
    </button>
  );
}

export function MobileDailyTicketSlider({
  query,
  selected,
  onSelect,
}: {
  /** Raw text the operator typed — the filter. */
  query: string;
  /** Currently linked ticket id as a string ('' = none). */
  selected: string;
  onSelect: (ticketId: string) => void;
}) {
  const { options, isLoading, isError, notConfigured } = useDailyTicketCandidates(query);

  if (notConfigured) {
    return <p className={QUIET_LINE_CLASS}>No helpdesk connected</p>;
  }

  if (options.length === 0) {
    // One muted line for all three nothings — `isLoading` only wins while the
    // row is genuinely empty, so a keystroke never blanks chips already shown.
    if (isLoading) return <p className={QUIET_LINE_CLASS}>Finding tickets…</p>;
    if (isError) return <p className={QUIET_LINE_CLASS}>Could not reach the helpdesk</p>;
    return <p className={QUIET_LINE_CLASS}>No matching tickets</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {/*
 * The ACTIVE FILTER readout (operator 2026-09-15).
 * The ACTIVE FILTER readout (operator 2026-09-15). The slider sits ABOVE
 */}
      <p className={cn(QUIET_LINE_CLASS, 'py-0')}>
        {query.trim()
          ? `${options.length} matching ${options.length === 1 ? 'ticket' : 'tickets'}`
          : 'Recent tickets'}
      </p>
      <div role="group" aria-label="Matching tickets" className={TRACK_CLASS}>
        {options.map((option) => (
          <TicketChip
            key={option.id}
            option={option}
            selected={selected === String(option.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
