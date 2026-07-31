'use client';

/**
 * Shared Kinetic Ledger grid VALUE cells (grid-surface-descriptor plan Phase B).
 *
 * The Workbench spreadsheets (Pending `OrdersQueueTableRow`, Incoming
 * `IncomingGridRow`, Receiving `ReceivingGridRow`, and their group summaries)
 * copy-adapted the same cell value markup per surface — the em-dash empty, the
 * civil-day + tooltip date, the days-late / lane-age urgency value, the fixed
 * platform brand mark, the staff name, and the live-format timestamp. This
 * registry is the one home for those VALUE presenters so the row registries
 * compose instead of re-typing them.
 *
 * Contract: these are dumb value cells — resolved facts in (label/tone SoTs
 * already applied upstream where domain-specific), spans out. They never fetch,
 * never own cell-track chrome (`ordersQueueGridCell` / `incomingGridCell` stay
 * with the surface), and never invent tones — urgency hues come from
 * `getDaysLateTone` / `getLaneAgeTone` (`src/utils/date.ts`), marks from
 * `PlatformMark`. Size/density varies per surface via `className`
 * (`densityClasses.metaText` on Pending, `text-role-caption` on station grids).
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import {
  formatDateTimePST,
  getDaysLateTone,
  getLaneAgeTone,
} from '@/utils/date';
import { cn } from '@/utils/_cn';

/** The house empty-cell value — a quiet em dash (never blank, never "N/A"). */
export function GridCellDash({ className }: { className?: string }) {
  return (
    <span className={cn('text-text-faint', className)} aria-hidden>
      —
    </span>
  );
}

/**
 * Civil-day date value — compact label (e.g. `Jul 21`) with the full day in a
 * tooltip; missing → em dash. Callers resolve the label/tooltip through their
 * date SoT helper (`formatQueueRowDateCell`, `incomingDateCell`).
 */
export function GridDateCellValue({
  label,
  tooltip,
  className,
}: {
  label?: string | null;
  tooltip?: string | null;
  className?: string;
}) {
  if (!label) return <GridCellDash />;
  return (
    <HoverTooltip label={tooltip ?? label} focusable={false}>
      <span className={cn('tabular-nums normal-case tracking-normal text-text-muted', className)}>
        {label}
      </span>
    </HoverTooltip>
  );
}

/**
 * Age / urgency value — days past ship-by (`3d`, SLA-toned) when late, else the
 * lane-age compact label (`4h`), else em dash. Tones stay with the date SoT
 * (`getDaysLateTone` / `getLaneAgeTone`); the lane-age branch only shows when
 * the row is not late (matching every current surface).
 */
export function GridAgeCellValue({
  daysLate,
  laneAgeLabel,
  laneAgeHours,
  tooltip,
  className,
}: {
  daysLate: number | null;
  laneAgeLabel?: string | null;
  laneAgeHours?: number | null;
  tooltip?: string;
  className?: string;
}) {
  const base = 'tabular-nums normal-case tracking-normal';
  if (daysLate !== null) {
    return (
      <HoverTooltip label={tooltip ?? ''} focusable={false}>
        <span className={cn(base, getDaysLateTone(daysLate), className)}>{daysLate}d</span>
      </HoverTooltip>
    );
  }
  if (laneAgeLabel) {
    return (
      <HoverTooltip label={tooltip ?? ''} focusable={false}>
        <span className={cn(base, getLaneAgeTone(laneAgeHours ?? null), className)}>
          {laneAgeLabel}
        </span>
      </HoverTooltip>
    );
  }
  return <GridCellDash />;
}

/**
 * Fused ship-by commitment cell — the absolute civil day and the relative
 * urgency in one track (`Jun 17 · 41d`), replacing the adjacent Date + Age
 * pair. The day stays quiet (`text-text-muted`); only the lateness carries
 * tone, so a column of on-time rows reads calm and a late one pops.
 *
 * **Date-only, deliberately.** `deadline_at` is a `timestamptz`, but every
 * writer puts a date-only value in it: the ShipStation ingest path
 * (`parseShipDate`) returns `YYYY-MM-DD` on every branch, which Postgres
 * coerces to midnight, and the FBA path hardcodes a `23:59:59` end-of-day
 * sentinel. Rendering a time here would print `12:00 AM` on nearly every row —
 * not merely false precision but an inverted reading (midnight says "due at
 * the START of the day" when the fact is "due sometime that day"). A real
 * time-of-day needs a carrier-cutoff primitive that does not exist yet; add
 * that first, then this cell.
 */
export function GridSlaCellValue({
  dateLabel,
  dateTooltip,
  daysLate,
  laneAgeLabel,
  laneAgeHours,
  ageTooltip,
  className,
}: {
  dateLabel?: string | null;
  dateTooltip?: string | null;
  daysLate: number | null;
  laneAgeLabel?: string | null;
  laneAgeHours?: number | null;
  ageTooltip?: string;
  className?: string;
}) {
  const base = 'tabular-nums normal-case tracking-normal';
  const age =
    daysLate !== null ? (
      <span className={cn(base, getDaysLateTone(daysLate), className)}>{daysLate}d</span>
    ) : laneAgeLabel ? (
      <span className={cn(base, getLaneAgeTone(laneAgeHours ?? null), className)}>
        {laneAgeLabel}
      </span>
    ) : null;

  if (!dateLabel) return age ?? <GridCellDash />;

  return (
    <HoverTooltip
      label={[dateTooltip ?? dateLabel, ageTooltip].filter(Boolean).join(' · ')}
      focusable={false}
    >
      <span className="flex min-w-0 items-baseline gap-1">
        <span className={cn(base, 'shrink-0 text-text-muted', className)}>{dateLabel}</span>
        {age ? (
          <>
            {/* Quiet separator — never a second tone-carrying mark. */}
            <span className="shrink-0 text-text-faint" aria-hidden>
              ·
            </span>
            {age}
          </>
        ) : null}
      </span>
    </HoverTooltip>
  );
}

/**
 * Received/expected quantity fraction (`0/1`, `0/?`) — Unbox / Incoming
 * workbench qty track. `?` is load-bearing when expected is unknown (unfound
 * PO). Tone: multi-unit expected → warning; complete → emerald; else muted.
 */
export function GridQtyFractionValue({
  received,
  expected,
  tooltip,
  className,
}: {
  received: number;
  expected?: number | null;
  /** Hover tip; defaults to a plain-language received/expected sentence. */
  tooltip?: string | null;
  className?: string;
}) {
  const text = `${received}/${expected ?? '?'}`;
  const qtyExpected = expected ?? 0;
  const tone =
    qtyExpected > 1
      ? 'text-text-warning'
      : expected != null && received >= expected
        ? 'text-emerald-600'
        : 'text-text-muted';
  const tip =
    tooltip ??
    (expected == null
      ? `${received} received · expected count unknown (no PO line matched yet)`
      : `${received} of ${expected} received`);

  return (
    <HoverTooltip label={tip} focusable={false}>
      <span className={cn('min-w-0 truncate tabular-nums text-role-caption', tone, className)}>
        {text}
      </span>
    </HoverTooltip>
  );
}

/**
 * Fixed platform brand mark — display variant (tooltip + sr-only label), the
 * shape the station grids and group summaries share. The Pending leaf row keeps
 * its richer `OrderIdentityChips` mark (listing link + hover menu) — that is a
 * different job, not this cell.
 */
export function GridPlatformMarkValue({
  platformValue,
  label,
  textClassName,
}: {
  /** Resolved `sourcePlatformMetaFromLabel(...).value`; falsy → em dash. */
  platformValue?: string | null;
  label: string;
  textClassName?: string;
}) {
  if (!platformValue) return <GridCellDash />;
  return (
    <HoverTooltip label={label} focusable={false}>
      <span className="inline-flex items-center justify-center">
        <PlatformMark platformValue={platformValue} textClassName={textClassName} />
        <span className="sr-only">{label}</span>
      </span>
    </HoverTooltip>
  );
}

/**
 * Staff name value (tester / packer) — expects a `normalizePersonName`-cleaned
 * string where `'---'` means missing (renders the em dash).
 */
export function GridStaffCellValue({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  if (!name || name === '---') return <GridCellDash />;
  return (
    <span className={cn('min-w-0 truncate normal-case tracking-normal text-text-muted', className)}>
      {name}
    </span>
  );
}

/**
 * Full timestamp value via `formatDateTimePST` (guards the `'1'` sentinel +
 * naive wall-clock shapes). Subscribes to the live 12h↔24h preference so a
 * toggle repaints in place — mount it only in cells that show a timestamp.
 */
export function GridDateTimeCellValue({ raw, className }: { raw: string; className?: string }) {
  useTimeFormat();
  return (
    <span className={cn('min-w-0 truncate tabular-nums normal-case tracking-normal', className)}>
      {formatDateTimePST(raw)}
    </span>
  );
}
