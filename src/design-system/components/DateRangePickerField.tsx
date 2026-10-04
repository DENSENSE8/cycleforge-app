'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { CalendarRangeSelect } from '@/components/ui/calendar-range-select';
import { Calendar as CalendarIcon, ChevronDown, X } from '@/components/Icons';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cursorClickTarget } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { computeWeekRange, dateKeyToLocalDate } from '@/utils/date';

const DATE_RANGE_PICKER_VARIANTS = {
  range:
    'filter date range from-to period: presets + month grid + Clear/Apply; idle face includes the year; X clears',
  compact:
    'ship-by due date single day in a cell: month grid; click commits; no year; no X on the face; optional day presets above the month and an optional Clear footer (a due date); face paints MMM d or -- unless the surface supplies faceLabel (DataTable ship-by paints its AGE); replace native input type=date',
} as const;

type DateRangePickerVariant = keyof typeof DATE_RANGE_PICKER_VARIANTS;

type SharedFieldProps = {
  disabled?: boolean;
  fromDate?: Date;
  toDate?: Date;
  className?: string;
};

type DateRangePickerRangeProps = SharedFieldProps & {
  variant?: 'range';
  value: DateRange | undefined;
  onChange: (next: DateRange | undefined) => void;
  placeholder?: string;
  presets?: ReadonlyArray<{ label: string; range: () => DateRange }>;
  autoOpen?: boolean;
};

type DateRangePickerCompactProps = SharedFieldProps & {
  variant: 'compact';
  /** Civil day on the trigger. `undefined` still paints `--` — never a blank. */
  value: Date | undefined;
  /** Always a day. Clearing is {@link onClear}'s job, never `onChange`. */
  onChange: (next: Date) => void;
  /**
   * Quick days above the month (a due date's Today · Tomorrow · Next week —
   * task principle P5: presets + calendar, never chips-only). A pick commits
   * through `onChange`, same as a day in the grid.
   */
  presets?: ReadonlyArray<{ label: string; day: () => Date }>;
  /** When given and a day is set, the popover ends in a Clear footer that calls it. */
  onClear?: () => void;
  /**
   * Override the trigger WORD when the surface has a truer face for this day than the day itself.
   * tooltip (operator 2026-09-04). The CONTROL is unchanged — same month grid,
   */
  faceLabel?: string;
  /**
   * Accessible name for the trigger. Needed once {@link faceLabel} is in play:
   * the visible word can be `2d late`, which says the value but not the field.
   */
  ariaLabel?: string;
  /** Leading glyph. */
  leadingGlyph?: ComponentType<{ className?: string }>;
  /**
   * Desk pointer: Chrome click glyph. DataTable DATES opts in so hover rides
   * MorphCursorLayer together with HoverTooltip's label chip.
   */
  clickCursor?: boolean;
};

type DateRangePickerFieldProps = DateRangePickerRangeProps | DateRangePickerCompactProps;

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

const TRIGGER_CLASS =
  'inline-flex h-9 w-full items-center gap-2 rounded-lg border border-border-soft bg-surface-card px-2.5 text-left text-role-caption font-semibold text-text-muted transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50';

const POPOVER_SHELL = cn(
  'border border-border-soft bg-surface-card shadow-lg ring-1 ring-black/5 focus:outline-none',
  DROPDOWN_SHELL_CORNER,
);

const POPOVER_CLASS = cn('z-dropdown', POPOVER_SHELL);

/**
 * A day field also lives inside phone sheets / modals (z-modal and up): its portal must outrank
 * the surface that holds its trigger — the house `ui/popover` layer, z-command — and take pointer
 * events back from the modal's `body { pointer-events: none }` (the sheet's Radix dialog runs a
 * different dismissable-layer build than this popover, so they don't share a layer stack).
 */
const COMPACT_POPOVER_CLASS = cn('pointer-events-auto z-command', POPOVER_SHELL);

/** Trigger + popover over the house calendar. */
export function DateRangePickerField(props: DateRangePickerFieldProps) {
  if (props.variant === 'compact') {
    return <CompactDatePickerField {...props} />;
  }
  return <RangeDatePickerField {...props} />;
}

function CompactDatePickerField({
  value,
  onChange,
  disabled = false,
  fromDate,
  toDate,
  className,
  faceLabel,
  ariaLabel,
  leadingGlyph: LeadingGlyph,
  clickCursor = false,
  presets,
  onClear,
}: DateRangePickerCompactProps) {
  const [open, setOpen] = useState(false);
  // Paint the picked day immediately; the parent cache is the source of truth
  // and resets this if the write rolls back.
  const [selected, setSelected] = useState<Date | undefined>(value);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  // The surface's face wins when it has one (ship-by paints its age); the day
  // itself is the default, and `--` is the never-blank floor.
  const label = faceLabel?.trim() || (selected ? format(selected, 'MMM d') : '--');
  const commit = (day: Date) => {
    setSelected(day);
    onChange(day);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          {...(clickCursor ? cursorClickTarget() : null)}
          className={cn(TRIGGER_CLASS, 'text-text-default', className)}
        >
          {LeadingGlyph ? (
            <LeadingGlyph className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          )}
          <span className="flex-1 truncate">{label}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className={COMPACT_POPOVER_CLASS}>
          {presets && presets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-border-hairline p-2">
              {presets.map((preset) => {
                const day = preset.day();
                const on = selected != null && selected.toDateString() === day.toDateString();
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => commit(day)}
                    className={cn(
                      'h-7 rounded-full px-3 text-role-caption font-semibold transition-colors',
                      on ? 'bg-fill-info/15 text-text-info' : 'bg-surface-sunken text-text-muted hover:text-text-default',
                      focusRing('control'),
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (!day) {
                setOpen(false);
                return;
              }
              commit(day);
            }}
            numberOfMonths={1}
            defaultMonth={selected ?? new Date()}
            disabled={
              fromDate || toDate
                ? { before: fromDate ?? new Date(0), after: toDate ?? new Date(8.64e15) }
                : undefined
            }
          />
          {onClear && selected ? (
            <div className="flex items-center border-t border-border-hairline px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(undefined);
                  onClear();
                  setOpen(false);
                }}
                className={cn('text-role-eyebrow text-text-soft hover:text-text-default', focusRing('control'))}
              >
                Clear
              </button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RangeDatePickerField({
  value,
  onChange,
  placeholder = 'Pick a date range',
  disabled = false,
  presets = DEFAULT_PRESETS,
  fromDate,
  toDate,
  className,
  autoOpen = false,
}: DateRangePickerRangeProps) {
  const [open, setOpen] = useState(autoOpen);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!autoOpen) return;
    setDraft(valueRef.current);
    setOpen(true);
  }, [autoOpen]);

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
      {/* Clear is a SIBLING of the trigger, not a child of it. */}
      <span className={cn('relative inline-flex', hasValue ? 'items-center' : null)}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              TRIGGER_CLASS,
              hasValue ? 'text-text-default pr-7' : 'text-text-faint',
              className,
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
            <span className="flex-1 truncate">{label}</span>
          </button>
        </Popover.Trigger>
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
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded',
              'text-text-faint hover:bg-surface-sunken hover:text-text-muted',
              focusRing('control'),
            )}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </span>

      <Popover.Portal>
        <Popover.Content
          align="end"
          alignOffset={-8}
          sideOffset={6}
          className={POPOVER_CLASS}
        >
          {presets.length > 0 ? (
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
              className="text-role-eyebrow text-text-soft hover:text-text-default"
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
              className="rounded-md bg-blue-600 px-3 py-1 text-role-caption font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-surface-strong"
            >
              Apply
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
