'use client';

import { ReactNode, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { DateRange } from 'react-day-picker';
import {
  PaneHeader,
  PaneHeaderTitle,
} from './pane-header';
import { CalendarRangeSelect } from '@/components/ui/calendar-range-select';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives/IconButton';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { dateKeyToLocalDate, formatWeekRangeCompact, localDateToDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


interface WeekRange {
  startStr: string;
  endStr: string;
}


/* ── YYYY-MM-DD ⇄ Date helpers (picker bridge only — civil SoT in @/utils/date) ── */
const parseKey = (k?: string | null): Date | undefined =>
  k ? dateKeyToLocalDate(k) : undefined;
const fmtKey = (d?: Date): string => localDateToDateKey(d) ?? '';

function periodTooltip(label: ReactNode, count?: number): string {
  const base = typeof label === 'string' || typeof label === 'number' ? String(label) : 'Period';
  return count != null ? `${base} • ${count}` : base;
}

interface DateRangePickerPillProps {
  /** Period text (e.g. "JUN 23rd – 27th") — shown in tooltip + popover header. */
  label: ReactNode;
  /** Right-detail count ("… • 29") — shown in tooltip + popover header. */
  count?: number;
  /** Enables a calendar + Apply for an arbitrary range. */
  onSelectCustomRange?: (range: WeekRange) => void;
  /** Active explicit range — seeds the calendar's open month + selection. */
  activeRange?: WeekRange | null;
  /** Reset affordance (e.g. back to the current week); shown when set. */
  onClear?: () => void;
  /**
   * Prev/next week stepping — rendered inside the popover under the period
   * summary (never as a wide header pill).
   */
  weekNav?: { weekOffset: number; onPrev: () => void; onNext: () => void };
  className?: string;
}

/**
 * Compact period control for workbench chrome. Interactive surfaces render as a
 * calendar {@link ToolbarButton} (icon rail peer of search / fields) that opens
 * a popover with the period summary, optional week steppers, and calendar.
 * Static (no picker / weekNav) still renders a read-only fact pill.
 *
 * It owns no application state: every choice flows out through
 * `onSelectCustomRange` / `weekNav` so each surface maps a selection onto its
 * own URL params (the shipped table writes `?shippedWeekOffset` / `?dateFrom`).
 */
export function DateRangePickerPill({
  label,
  count,
  onSelectCustomRange,
  activeRange,
  onClear,
  weekNav,
  className,
}: DateRangePickerPillProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const hasPicker = Boolean(onSelectCustomRange);
  const interactive = hasPicker || Boolean(weekNav);
  const periodOffDefault = Boolean(activeRange) || (weekNav != null && weekNav.weekOffset !== 0);
  const tip = periodTooltip(label, count);

  // Read-only fact chip (e.g. scope label + count with no period controls).
  if (!interactive) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1',
          className,
        )}
      >
        <span className="text-role-caption font-semibold uppercase tracking-widest text-text-default">
          {label}
        </span>
        {count != null ? (
          <>
            <span aria-hidden className="text-text-faint">
              •
            </span>
            <span className="text-role-caption font-semibold tabular-nums text-text-soft">{count}</span>
          </>
        ) : null}
      </span>
    );
  }

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(
        activeRange?.startStr
          ? { from: parseKey(activeRange.startStr), to: parseKey(activeRange.endStr) }
          : undefined,
      );
    }
    setOpen(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {/* HoverTooltip wraps Trigger (no asChild) — Radix Slot needs a single
          DOM child; a span wrapper is fine in the icon rail. */}
      <HoverTooltip label={tip}>
        <Popover.Trigger asChild>
          <ToolbarButton
            iconOnly
            active={open || periodOffDefault}
            aria-label={tip}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-testid="date-range-pill"
            className={className}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        </Popover.Trigger>
      </HoverTooltip>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className={cn("z-dropdown w-auto min-w-[14rem] rounded-xl border border-border-soft bg-surface-card shadow-lg ring-1 ring-black/5", focusRing('field', 'accent'))}
        >
          {/* Period title + week steppers. Suppressed whenever the calendar is
              shown: it restates the period the calendar already displays and
              stacks a second chevron pair directly above the month nav. On the
              week-stepping surfaces (Unbox / Testing / Station history) there
              is no calendar, so this row IS the popover — never make it
              unconditional again, or those three open empty. */}
          {!hasPicker ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-role-caption font-semibold uppercase tracking-widest text-text-default">
                  {label}
                </p>
                {count != null ? (
                  <p className="text-role-eyebrow tabular-nums text-text-soft">{count} rows</p>
                ) : null}
              </div>
              {weekNav ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    size="sm"
                    ariaLabel="Previous week"
                    icon={<ChevronLeft className="h-3.5 w-3.5" />}
                    onClick={weekNav.onPrev}
                  />
                  <IconButton
                    size="sm"
                    ariaLabel="Next week"
                    icon={<ChevronRight className="h-3.5 w-3.5" />}
                    onClick={weekNav.onNext}
                    disabled={weekNav.weekOffset === 0}
                  />
                </div>
              ) : null}
            </div>
          ) : null}


          {onSelectCustomRange ? (
            <>
              <CalendarRangeSelect
                selected={draft}
                onSelect={setDraft}
                numberOfMonths={1}
                defaultMonth={draft?.from ?? parseKey(activeRange?.startStr) ?? new Date()}
              />
              <div className="flex items-center justify-between border-t border-border-hairline px-3 py-2">
                {/* ds-raw-button: text link footer action (no chrome) */}
                <button
                  type="button"
                  onClick={() => {
                    onClear?.();
                    setOpen(false);
                  }}
                  className="text-role-eyebrow uppercase tracking-wider text-text-soft hover:text-text-default"
                >
                  {onClear ? 'Reset' : 'Cancel'}
                </button>
                {/* ds-raw-button: primary apply pill scoped to the popover */}
                <button
                  type="button"
                  disabled={!draft?.from}
                  onClick={() => {
                    if (!draft?.from) return;
                    onSelectCustomRange({
                      startStr: fmtKey(draft.from),
                      endStr: fmtKey(draft.to ?? draft.from),
                    });
                    setOpen(false);
                  }}
                  className="rounded-md bg-blue-600 px-3 py-1 text-role-caption font-semibold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-surface-strong"
                >
                  Apply
                </button>
              </div>
            </>
          ) : onClear ? (
            <div className="flex items-center justify-end border-t border-border-hairline px-3 py-2">
              {/* ds-raw-button: text link footer action (no chrome) */}
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="text-role-eyebrow uppercase tracking-wider text-text-soft hover:text-text-default"
              >
                Reset to this week
              </button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface DateRangeHeaderProps {
  /** Period total — shown in the icon tooltip + popover header. */
  count: number;
  /** Optional left title (e.g. "Today"). */
  label?: ReactNode;
  /** Far-left extra content (rare). */
  leftSlot?: ReactNode;
  /** Right-side surface content (search chip, refresh spinner, close button). */
  rightSlot?: ReactNode;
  /** Top-right chrome — the columns icon lives here (always last on the right). */
  columns?: ReactNode;
  /** Week range backing the period label; omit for a plain count (no control). */
  weekRange?: WeekRange;
  weekOffset?: number;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  /** Custom range via calendar — enables the rich picker. */
  onSelectCustomRange?: (range: WeekRange) => void;
  /** Active explicit (non-week) range — overrides the period label + seeds the calendar. */
  activeRange?: WeekRange | null;
  /** Reset to the default week. */
  onClear?: () => void;
}

/**
 * Slim 40px table header: compact calendar period icon on the left and the
 * columns icon pinned top-right. Surfaces with week stepping pass `weekRange`
 * + `onPrevWeek`/`onNextWeek` (chevron steppers live in the popover). The
 * shipped surface additionally passes `onSelectCustomRange` + `activeRange`
 * for the custom-range calendar picker. A surface with no
 * `weekRange` (e.g. Repair) renders a plain count with no control.
 */
export default function DateRangeHeader({
  count,
  label,
  leftSlot,
  rightSlot,
  columns,
  weekRange,
  weekOffset = 0,
  onPrevWeek,
  onNextWeek,
  onSelectCustomRange,
  activeRange,
  onClear,
}: DateRangeHeaderProps) {
  // Period label: an active explicit range wins, else the week range; if neither,
  // there's no control and we fall back to a bare count.
  const pillRange = activeRange ?? weekRange ?? null;
  const pillLabel = pillRange ? formatWeekRangeCompact(pillRange.startStr, pillRange.endStr) : null;
  const weekNav =
    weekRange && onPrevWeek && onNextWeek ? { weekOffset, onPrev: onPrevWeek, onNext: onNextWeek } : undefined;

  return (
    <PaneHeader
      // Inner gray-300 row divider (matches sidebar + day-group bands), not the
      // faint outer border on the translucent sticky shell.
      className="border-b-0"
      rowClassName="border-b border-border-default"
      leftSlot={
        <>
          {leftSlot ? <div className="shrink-0">{leftSlot}</div> : null}
          {label ? <PaneHeaderTitle>{label}</PaneHeaderTitle> : null}
          {pillLabel != null ? (
            <DateRangePickerPill
              label={pillLabel}
              count={count}
              onSelectCustomRange={onSelectCustomRange}
              activeRange={activeRange}
              onClear={onClear}
              weekNav={weekNav}
            />
          ) : (
            <span className="font-dm-sans text-sm font-semibold tabular-nums text-blue-700">{count}</span>
          )}
        </>
      }
      rightSlot={
        rightSlot || columns ? (
          <div className="flex items-center gap-1.5">
            {rightSlot}
            {columns}
          </div>
        ) : null
      }
    />
  );
}
