'use client';

import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { CalendarRangeSelect } from '@/components/ui/calendar-range-select';
import { Calendar as CalendarIcon, ChevronDown, X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { computeWeekRange, dateKeyToLocalDate } from '@/utils/date';

export interface DateRangePickerFieldProps {
  /** Current value. `undefined` = nothing picked yet. `{from, to: undefined}` = first endpoint only. */
  value: DateRange | undefined;
  onChange: (next: DateRange | undefined) => void;
  /** Trigger button label when no range is set. */
  placeholder?: string;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Optional shortcut chips below the calendar (Today / This week / Last 7 / …). */
  presets?: ReadonlyArray<{ label: string; range: () => DateRange }>;
  /** Earliest selectable day. */
  fromDate?: Date;
  /** Latest selectable day. */
  toDate?: Date;
  /** Extra classes on the trigger button. */
  className?: string;
  /** When true, open the calendar popover on mount (find-field chip → edit date). */
  autoOpen?: boolean;
}

const DEFAULT_PRESETS: ReadonlyArray<{ label: string; range: () => DateRange }> = [
  {
    label: 'Today',
    range: () => {
      const d = new Date();
      return { from: d, to: d };
    },
  },
  {
    label: 'This week',
    range: () => {
      const week = computeWeekRange(0);
      return {
        from: dateKeyToLocalDate(week.startStr) ?? week.start,
        to: dateKeyToLocalDate(week.endStr) ?? week.end,
      };
    },
  },
  {
    label: 'Last 7 days',
    range: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 6);
      return { from, to };
    },
  },
  {
    label: 'Last 30 days',
    range: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      return { from, to };
    },
  },
  {
    label: 'This month',
    range: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now };
    },
  },
];

/**
 * Trigger-button + Radix Popover + react-day-picker range mode. Drop-in
 * replacement for `<input type="date">` pairs when the operator picks a
 * date range to filter by. Owns no application state — fully controlled
 * via {@link DateRangePickerFieldProps.value} + onChange.
 *
 * Layout (popover open):
 *   ┌──────────────────────────────────────┐
 *   │ Today | Week | 7 days | 30d | Month │  presets row
 *   ├──────────────────────────────────────┤
 *   │      [ inline calendar ]              │  react-day-picker, range mode
 *   ├──────────────────────────────────────┤
 *   │       Clear        Apply              │  footer
 *   └──────────────────────────────────────┘
 */
export function DateRangePickerField({
  value,
  onChange,
  placeholder = 'Pick a date range',
  disabled = false,
  presets = DEFAULT_PRESETS,
  fromDate,
  toDate,
  className,
  autoOpen = false,
}: DateRangePickerFieldProps) {
  const [open, setOpen] = useState(autoOpen);
  // Local working copy — only commits to parent on "Apply" or preset click
  // so a half-picked range doesn't fire useEffect chains on every click.
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  useEffect(() => {
    if (!autoOpen) return;
    setDraft(value);
    setOpen(true);
    // Re-arm when the parent remounts with a fresh autoOpen key.
  }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync draft when the popover opens (parent may have changed value).
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const hasValue = Boolean(value?.from);
  const label = (() => {
    if (!value?.from) return placeholder;
    const from = format(value.from, 'MMM d, yyyy');
    if (!value.to || value.to.getTime() === value.from.getTime()) return from;
    const to = format(value.to, 'MMM d, yyyy');
    return `${from} → ${to}`;
  })();

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-9 w-full items-center gap-2 rounded-lg border border-border-soft bg-surface-card px-2.5 text-left text-role-caption font-semibold text-text-muted transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50',
            hasValue ? 'text-text-default' : 'text-text-faint',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="flex-1 truncate">{label}</span>
          {hasValue ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(undefined);
                setDraft(undefined);
              }}
              aria-label="Clear date range"
              className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded text-text-faint hover:bg-surface-sunken hover:text-text-muted"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          // Right-aligned with an inset (operator ruling 2026-08-31): the
          // control sits near the sheet's right edge, so a start-aligned panel
          // hung off it. The offset keeps the panel a few px inside the edge
          // rather than flush against it.
          align="end"
          alignOffset={-8}
          sideOffset={6}
          className="z-dropdown rounded-xl border border-border-soft bg-surface-card shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          {presets.length > 0 ? (
            /*
             * Presets as a DROPDOWN, not a row of chips (operator ruling
             * 2026-08-31).
             *
             * Five uppercase labels laid side by side set the popover's width
             * from the longest phrase rather than from the calendar under it,
             * so the panel spilled wider than the control it hangs off and
             * fought the toolbar's alignment. A select is one line at any
             * label length, and the calendar below it becomes the widest thing
             * in the panel — which is the thing the panel is actually for.
             */
            <div className="border-b border-border-hairline p-2">
              <label className="sr-only" htmlFor="cf-date-preset">
                Quick range
              </label>
              <div className="relative">
                <select
                  id="cf-date-preset"
                  value=""
                  onChange={(event) => {
                    const preset = presets.find((p) => p.label === event.target.value);
                    if (!preset) return;
                    const r = preset.range();
                    setDraft(r);
                    onChange(r);
                    setOpen(false);
                  }}
                  className={cn(
                    'h-8 w-full cursor-pointer appearance-none rounded-md border border-border-soft bg-surface-card pl-2.5 pr-7',
                    'text-role-caption font-semibold text-text-default hover:border-blue-300',
                  )}
                >
                  <option value="">Quick range…</option>
                  {presets.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              </div>
            </div>
          ) : null}

          <CalendarRangeSelect
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={1}
            defaultMonth={draft?.from ?? new Date()}
            disabled={
              fromDate || toDate
                ? { before: fromDate ?? new Date(0), after: toDate ?? new Date(8.64e15) }
                : undefined
            }
          />

          <div className="flex items-center justify-between border-t border-border-hairline px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setDraft(undefined);
                onChange(undefined);
                setOpen(false);
              }}
              className="text-role-eyebrow uppercase tracking-wider text-text-soft hover:text-text-default"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              disabled={!draft?.from}
              className="rounded-md bg-blue-600 px-3 py-1 text-role-caption font-semibold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-surface-strong"
            >
              Apply
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
