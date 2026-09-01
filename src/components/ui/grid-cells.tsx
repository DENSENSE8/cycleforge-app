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

/**
 * The row's lifecycle STATE — a leading dot inside the house chip.
 *
 * ## Why a chip, and why the dot is inside it (ruled 2026-08-02)
 *
 * The status column is where a state lives, and a state is a categorical label:
 * the house vocabulary for that is the 3-layer chip (fill · ink · inset ring —
 * `ui-design-system.md` → Eyebrow headers + chips), not bare text. Bare text in
 * a ruled band reads as another data value, which is why several surfaces had
 * quietly grown their own local chip for exactly this job (`PickupStatusChip`,
 * My Day's `GridTagChip`, Ready's `CHIP`) — four spellings of one thing.
 *
 * The dot sits INSIDE the chip rather than beside it, because a dot floating in
 * the cell next to a chip is two objects in one cell — the shape a column is
 * supposed to prevent. Inside, the pair reads as one status token, shares the
 * cell's alignment, and travels together under a drag-resize.
 *
 * **The dot is not redundant with the chip's tone.** It carries the finer
 * lifecycle vocabulary (`getStatusDotBg` / coarse stage) — not a qty-complete
 * shortcut. Unboxed ≠ Received: quantity-full while still UNBOXED stays indigo,
 * not emerald.
 *
 * `toneClass` comes from the surface's lifecycle registry (`workflowStage().badge`,
 * `pickupOrderStatusChipClass`, …) — **never a local map**. The ring derives from
 * the resolved ink (`ring-current/20`) so the third layer needs no new field on
 * any registry.
 *
 * ## The live-change pulse (2026-08-20)
 *
 * When `label` changes under a chip that is already mounted, the chip runs
 * `motionRole.feedback.liveChange` — a double pulse with the label morphing
 * inside the first beat. It is unconditional and it is here on purpose: this
 * component is where every data-table status chip in the app resolves, so a
 * tech scan at the bench is legible on the packer's board, the receiving grid
 * and the home daily grid without any surface wiring a flash of its own. Rows
 * are keyed by record id through the virtualizer (`getItemKey`), so scrolling a
 * row into the window is a MOUNT, never a change — see `shouldPulseLiveValue`.
 *
 * The fourth layer the pulse needs is the `ringRef` overlay: an absolute
 * inset-0 ring that flashes on opacity alone. The chip's own `ring-current/20`
 * cannot do it — animating a static ring's colour would leave the resting chip
 * changed, and a `box-shadow` spread (the shape the originating spec proposed)
 * paints outside the chip's box in a ruled grid band.
 */
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
 * Floor counted/expected quantity fraction (`0/1`, `0/?`) — Unbox / Incoming
 * workbench **Qty** track (column label Qty, not Received). `?` is load-bearing
 * when expected is unknown (unfound PO). Tip uses "counted" via
 * `floorQtyFractionTip` — never the inventory noun Received (Unboxed ≠ Received).
 * Tone: multi-unit expected → warning; qty-complete → emerald; else muted.
 */
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
 * Punches a transparent core out of the dot, turning the same paint into a ring.
 *
 * A mask rather than a border, because the paint arrives in TWO shapes —
 * `{ style: { backgroundColor: '#hex' } }` for a branded platform/carrier, and
 * `{ className: 'bg-blue-500' }` for the fallbacks. A border would need that
 * colour on the border channel, and converting `bg-*` to `border-*` at runtime
 * is the classic Tailwind trap: a class assembled from a string is never
 * scanned, so the utility is never generated and the border silently does not
 * paint (`build-gotchas.md` → an un-scanned class renders invisible).
 *
 * A mask needs no colour channel at all. It works on whichever shape the paint
 * arrived in, and the hole is genuinely transparent — so the row's own
 * background (hover wash, selection, zebra) shows through and the ring stays
 * correct on every row state without knowing what any of them are.
 */
const BRAND_DOT_RING = {
  WebkitMaskImage: 'radial-gradient(circle, transparent 38%, black 40%)',
  maskImage: 'radial-gradient(circle, transparent 38%, black 40%)',
} as const;

/**
 * Dense Sheets brand-identity micro-dot — platform / carrier paint beside a
 * quiet last-8 face when type glyphs are omitted. Same size as the lifecycle
 * dot inside {@link GridStatusCellValue}, different meaning: paint comes only
 * from `platformMetaBrandDot` / `carrierBrandDotPaint`, never a status map.
 *
 * ## `variant` says WHICH KIND of identifier the dot marks
 *
 * `'filled'` is an ORDER handle (platform brand); `'ring'` is a TRACKING number
 * (carrier brand). The compound row stacks one of each, and the two chips beside
 * them are deliberately face-less — their own docblocks say the quiet face is
 * for "Sheets grids whose header already labels ORDER / TRACK". Stacked in one
 * cell under a single header, that precondition only half held: colour alone
 * asked an operator to learn which brand palette meant which line, and told
 * them nothing at all on a row where the order id and the tracking number are
 * the same digits.
 *
 * Shape is the answer that stays inside the house law. It is still a colour
 * dot — no glyph, no type mark, nothing the table engine could flag back on —
 * but solid-vs-hollow reads instantly and survives scrolling past the header.
 * Both variants are the SAME 6px box, so the text beside them starts at the
 * same x on both lines; a larger ring would misalign the very baselines the
 * compound cell exists to hold level.
 */
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

/**
 * Dropdown / menu face for a platform or carrier — the SAME marks the Order
 * column paints ({@link BrandIdentityDot} filled vs ring). Colour comes only
 * from `platformMetaBrandDot` and `carrierBrandDotPaint`. No brand SVG.
 * Compact is accepted for call-site stability; both kinds are the dot alone.
 */
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
export function GridMonthDayTimeCellValue({ raw, className }: { raw: string; className?: string }) {
  useTimeFormat();
  return (
    <span className={cn('min-w-0 truncate tabular-nums normal-case tracking-normal', className)}>
      {formatMonthDayTimePST(raw)}
    </span>
  );
}
