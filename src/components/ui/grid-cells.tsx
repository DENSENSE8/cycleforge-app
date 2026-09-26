'use client';

/** Shared Kinetic Ledger grid VALUE cells (grid-surface-descriptor plan Phase B). */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useLiveValueChange } from '@/design-system/motion';
import { PlatformMark } from '@/components/ui/PlatformMark';
import {
  CARRIER_BRANDS,
  carrierBrandDotPaint,
  displayCarrierFromHint,
} from '@/lib/carrier-brand';
import {
  platformMetaBrandDot,
  sourcePlatformMeta,
  sourcePlatformMetaFromLabel,
  type SourcePlatformMeta,
} from '@/lib/source-platform';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import {
  formatDateTimePST,
  formatMonthDayTimePST,
  getDaysLateTone,
  getLaneAgeTone,
} from '@/utils/date';
import { floorQtyFractionTip } from '@/lib/receiving/rail/quantity';
import { cn } from '@/utils/_cn';

/** The house empty-cell value — a quiet em dash (never blank, never "N/A"). */
export function GridCellDash({ className }: { className?: string }) {
  return (
    <span className={cn('text-text-faint', className)} aria-hidden>
      —
    </span>
  );
}

/** The row's lifecycle STATE — a leading dot inside the house chip. */
export function GridStatusCellValue({
  label,
  toneClass,
  dotClass,
  tooltip,
  className,
}: {
  label?: string | null;
  toneClass: string;
  dotClass?: string | null;
  tooltip?: string | null;
  className?: string;
}) {
  // Before the empty-value branch: an early return above a hook is the one
  // thing the rules of hooks will not forgive, and a cell that dashes out is
  // exactly a cell whose next value may arrive live.
  const { chipRef, ringRef, labelRef } = useLiveValueChange(label);
  if (!label) return <GridCellDash />;
  const chip = (
    <span
      ref={chipRef}
      className={cn(
        'relative inline-flex min-w-0 items-center gap-1.5 rounded ring-1 ring-inset ring-current/20',
        'inset-chip text-role-micro uppercase tracking-widest',
        // The colour half of the morph. The pulse animates transform+opacity;
        // the fill/ink swap is a plain class change, so without this it snaps
        // a frame before the pulse is over.
        'transition-colors duration-200 ease-out motion-reduce:transition-none',
        toneClass,
        className,
      )}
    >
      <span
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded opacity-0 ring-1 ring-inset ring-current"
      />
      {dotClass ? (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} aria-hidden />
      ) : null}
      <span ref={labelRef} className="min-w-0 truncate">
        {label}
      </span>
    </span>
  );
  if (!tooltip) return chip;
  return (
    <HoverTooltip label={tooltip} focusable={false}>
      {chip}
    </HoverTooltip>
  );
}

/**
 * Civil-day date value — compact label (e.g. `Jul 21`) with the full day in a
 * tooltip; missing → em dash. Callers resolve the label/tooltip through their
 * date SoT helper (`formatQueueRowDateCell`).
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

/** Age / urgency value — days past ship-by (`3d`, SLA-toned) when late, else the lane-age compact label (`4h`), else em dash. */
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

/** Floor counted/expected quantity fraction (`0/1`, `0/?`) — Unbox / Incoming workbench **Qty** track (column label Qty, not Received). */
export function GridQtyFractionValue({
  received,
  expected,
  tooltip,
  className,
}: {
  received: number;
  expected?: number | null;
  /** Hover tip; defaults to floor counted/expected (never "received"). */
  tooltip?: string | null;
  className?: string;
}) {
  const text = `${received}/${expected ?? '?'}`;
  const qtyExpected = expected ?? 0;
  const complete = expected != null && received >= expected;
  const tone =
    received === 0
      ? 'text-text-faint'
      : qtyExpected > 1
        ? 'text-text-warning'
        : complete
          ? 'text-emerald-600'
          : 'text-text-muted';
  const tip = tooltip ?? floorQtyFractionTip(received, expected);

  return (
    <HoverTooltip label={tip} focusable={false}>
      <span className={cn('min-w-0 truncate tabular-nums text-role-caption', tone, className)}>
        {text}
      </span>
    </HoverTooltip>
  );
}

/** Fixed platform brand mark — display variant (tooltip + sr-only label), the shape the station grids and group summaries share. */
export function GridPlatformMarkValue({
  platformValue,
  label,
  textClassName,
  meta,
}: {
  /** Resolved `sourcePlatformMetaFromLabel(...).value`; falsy → em dash. */
  platformValue?: string | null;
  label: string;
  textClassName?: string;
  /** Catalog-aware meta (accent hex / renamed label). */
  meta?: import('@/lib/source-platform').SourcePlatformMeta;
}) {
  if (!platformValue && !meta?.value) return <GridCellDash />;
  return (
    <HoverTooltip label={label} focusable={false}>
      <span className="inline-flex items-center justify-center">
        <PlatformMark
          platformValue={platformValue}
          meta={meta}
          textClassName={textClassName}
          preferBrandTile
        />
        <span className="sr-only">{label}</span>
      </span>
    </HoverTooltip>
  );
}

/**
 * Staff name value (tester / packer) — expects a `normalizePersonName`-cleaned
 * string where `'---'` means missing (renders the em dash).
 */
function GridStaffCellValue({
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

/** Punches a transparent core out of the dot, turning the same paint into a ring. */
const BRAND_DOT_RING = {
  WebkitMaskImage: 'radial-gradient(circle, transparent 38%, black 40%)',
  maskImage: 'radial-gradient(circle, transparent 38%, black 40%)',
} as const;

/** Dense Sheets brand-identity micro-dot — platform / carrier paint beside a quiet last-8 face when type glyphs are omitted. */
export function BrandIdentityDot({
  className,
  style,
  variant = 'filled',
}: {
  className?: string;
  style?: { backgroundColor: string };
  /** `'filled'` = order / platform. `'ring'` = tracking / carrier. */
  variant?: 'filled' | 'ring';
}) {
  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', className)}
      style={variant === 'ring' ? { ...style, ...BRAND_DOT_RING } : style}
      aria-hidden
    />
  );
}

/** Dropdown / menu face for a platform or carrier — the SAME marks the Order column paints ({@link BrandIdentityDot} filled vs ring). */
export function MenuBrandIdentity({
  kind,
  label,
  value,
  meta: metaOverride,
}: {
  kind: 'platform' | 'carrier';
  label: string;
  /** Stored slug when known — more precise than a display label. */
  value?: string;
  /** Catalog-aware platform meta (org `color_hex`). */
  meta?: SourcePlatformMeta;
  compact?: boolean;
}) {
  if (kind === 'carrier') {
    const carrier = displayCarrierFromHint(value ?? label);
    const brand = carrier ? CARRIER_BRANDS[carrier] : CARRIER_BRANDS.Unknown;
    const paint = carrierBrandDotPaint(brand);
    return (
      <span
        data-brand-identity="carrier"
        className="inline-flex shrink-0 items-center"
        title={label}
        aria-hidden
      >
        <BrandIdentityDot variant="ring" className={paint.className} style={paint.style} />
      </span>
    );
  }
  const resolved = metaOverride ?? (value ? sourcePlatformMeta(value) : sourcePlatformMetaFromLabel(label));
  const paint = platformMetaBrandDot(resolved);
  return (
    <span
      data-brand-identity="platform"
      className="inline-flex shrink-0 items-center"
      title={label}
      aria-hidden
    >
      <BrandIdentityDot className={paint.className} style={paint.style} />
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

/**
 * Dense instant face via `formatMonthDayTimePST` — `Jul 13, 4:15 PM` (no year).
 * Same preference subscription as {@link GridDateTimeCellValue}; use for narrow
 * ledger stamps (e.g. Orders Tested-at).
 */
function GridMonthDayTimeCellValue({ raw, className }: { raw: string; className?: string }) {
  useTimeFormat();
  return (
    <span className={cn('min-w-0 truncate tabular-nums normal-case tracking-normal', className)}>
      {formatMonthDayTimePST(raw)}
    </span>
  );
}
