'use client';

/**
 * The id-chip family. Three layers:
 *   - pure label helpers live in `@/lib/copy-chip-format` (re-exported below
 *     for existing importers);
 *   - copy/tooltip behavior lives in `useCopyChip` / `useChipTooltip`
 *     (`@/hooks`) — hover preview uses the site-wide tooltip from
 *     `SiteTooltipProvider`, wired via `src/components/Providers.tsx`; if the
 *     provider is absent, copy still works and there is no hover bubble;
 *   - this file owns the markup, the {@link CHIP_TONES} registry, and the
 *     named variants that carry the design-system rules.
 */
import React, { MouseEvent } from 'react';
import { isEmptyDisplayValue } from '@/utils/empty-display-value';
import { Barcode, ExternalLink, MapPin, Package, Pencil, Receipt, Tags, Ticket } from '../Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CarrierMark } from '@/components/ui/CarrierMark';
import { chipText, monoValue } from '@/design-system/tokens/typography/presets';
import type { OptimisticSerialFlag } from '@/lib/receiving/optimistic-serials';
import { useChipTooltip, useCopyChip } from '@/hooks';
import { conditionGradeChipStyleOrPending } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/components/station/receiving-constants';
import { skuScanPrefixBeforeColon, getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import {
  hasCarrierBrandPaint,
  resolveCarrierBrand,
} from '@/lib/carrier-brand';
import {
  EMPTY_CHIP_DISPLAY,
  QUIET_CHIP_EMPTY,
  getLast8,
  getLast8Serial,
  isEmptyChipDisplay,
  isSkuFormattedScanRef,
  normalizeCopyText,
  resolveChipDisplay,
  resolveSerialDisplay,
} from '@/lib/copy-chip-format';

// EMPTY_CHIP_DISPLAY / QUIET_CHIP_EMPTY: import from `@/lib/copy-chip-format`
// (SoT). Do not re-export here — knip flags unused barrel re-exports.
export {
  getLast8,
  getLast8Serial,
  isEmptyChipDisplay,
  isSkuFormattedScanRef,
  resolveChipDisplay,
  resolveSerialDisplay,
} from '@/lib/copy-chip-format';

// --- Icons ---

export const HashIcon = () => (
  <svg
    className="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

// --- Tone registry ---

/**
 * The single source of truth for what each chip color MEANS. One entry per
 * identifier concept — change a color here and every chip (including the ×N
 * group-count variants) follows.
 *
 *   id        gray / hash       internal order ids, PO#s, source order #s
 *   tracking  blue / map-pin    outbound carrier tracking numbers ONLY
 *   serial    emerald / barcode device/unit serial numbers
 *   sku       yellow / pencil   SKU-driven values (static scan refs, sku-table serials)
 *   fnsku     purple / package  Amazon FNSKUs scanned at FBA intake ONLY
 *   ticket    orange / hash     support ticket ids
 *   price     emerald / Receipt  Zoho PO unit cost on a receiving line
 */
// `dot` = accent-dot bg per tone, so surfaces that show a copied ref as a dot
// (e.g. the clipboard-history popover) read the same hue as the chip it came
// from — one tone SoT, no parallel dot map.
export const CHIP_TONES = {
  id: {
    icon: <HashIcon />,
    iconClass: 'text-text-soft',
    dot: 'bg-border-emphasis',
  },
  tracking: {
    icon: <MapPin className="h-4 w-4 shrink-0" />,
    iconClass: 'inline-flex items-center justify-center text-blue-500',
    dot: 'bg-blue-500',
  },
  serial: {
    icon: <Barcode className="h-4 w-4 shrink-0" />,
    iconClass: 'inline-flex items-center justify-center text-emerald-500',
    dot: 'bg-emerald-500',
  },
  sku: {
    icon: <Pencil className="h-4 w-4 shrink-0" />,
    iconClass: 'inline-flex items-center justify-center text-yellow-600',
    dot: 'bg-yellow-500',
  },
  fnsku: {
    icon: <Package className="h-4 w-4 shrink-0" />,
    iconClass: 'text-purple-500',
    dot: 'bg-purple-500',
  },
  ticket: {
    // Ticket-number chips render the flat ticket glyph as their primary mark
    // (not the `#` hash — that stays the id/PO chip's icon). One house ticket SoT.
    icon: <Ticket className="h-4 w-4 shrink-0" />,
    iconClass: 'text-orange-500',
    dot: 'bg-orange-500',
  },
  bin: {
    // Bin / location barcode — Tags glyph, teal family (distinct from tracking MapPin).
    icon: <Tags className="h-4 w-4 shrink-0" />,
    iconClass: 'inline-flex items-center justify-center text-teal-600',
    dot: 'bg-teal-500',
  },
  price: {
    icon: <Receipt className="h-4 w-4 shrink-0" />,
    iconClass: 'inline-flex items-center justify-center text-emerald-600',
    dot: 'bg-emerald-500',
  },
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

/**
 * Marks the OUTER wrapper of a quiet chip face — the element that owns
 * the chip's own horizontal breathing room (`px-1.5`). Every face in this
 * module carries it: the real {@link CopyChip}, plus the four presentational
 * siblings that must stay pixel-aligned with it ({@link EmptySkuChipFace},
 * {@link SerialChipSkeleton}, {@link PlatformChip}).
 *
 * **Why an attribute and not a prop.** A chip standing in a rail or a fact row
 * needs that padding; a chip inside a LedgerGrid cell must not have it, because
 * the cell already owns the inset (`ORDERS_QUEUE_CELL_INSET` = `px-2`) and the
 * two stack — every chip value sat 6px inside its column's content edge, so no
 * chip lined up with the plain-text cells above or below it. That is a property
 * of the CONTAINER, not of each call site: `outerPad="flush"` at ~12 chip call
 * sites across 14 grid families is a prop everyone has to remember, which is
 * the shape that drifts (`pattern-evolution.md`). One rule in
 * `styles/globals.css` — `[data-cf-grid] [data-chip-face]` — makes the grid
 * cell answer it once, for every family, including the next one.
 *
 * A chip rendered in a portaled popover is outside `[data-cf-grid]` and keeps
 * its padding, which is correct: it is no longer in a ruled column.
 *
 * Module-private: every face lives in this file, and exporting it would invite a
 * surface to stamp the marker on something that is not a chip face — which
 * would silently zero that element's padding inside any grid.
 *
 * Guard: `copy-chip-grid-flush.guard.test.ts`.
 */
const CHIP_FACE_ATTR = { 'data-chip-face': '' } as const;

// --- Base CopyChip ---

export interface CopyChipProps {
  value: string;
  display: string;
  /** Pulls icon/icon color from {@link CHIP_TONES}; individual props below override. */
  tone?: ChipTone;
  /** `undefined` falls back to the tone's icon; pass `null` for no icon (e.g. icon lives in another column). */
  icon?: React.ReactNode;
  iconClass?: string;
  /** Inline icon paint (e.g. org `platforms.color_hex` via {@link platformMetaIconTone}). */
  iconStyle?: React.CSSProperties;
  /** Width utility on the wrapper; default sizes to content (still respects `max-w-full` in tight layouts). */
  width?: string;
  disableCopy?: boolean;
  truncateDisplay?: boolean;
  /**
   * When true, the label sizes to its text and the button is `w-auto`.
   * Use for chips like serial numbers that must grow past a min width without shrinking the glyphs.
   */
  fitDisplayWidth?: boolean;
  /**
   * Fixed label footprint for last-8 identity faces. Keeps adjacent chips
   * stationary when a short / empty / editing value replaces eight digits.
   */
  displayWidth?: 'content' | 'last8';
  /** Called after a successful clipboard write. Use for side-effects (e.g. dispatch a custom event). */
  onCopy?: (value: string) => void;
  /**
   * Outer wrapper horizontal padding — `flush` aligns with sidebar grids where the chip icon lives in another column.
   *
   * **Inside a LedgerGrid you do not need this.** Every chip face carries
   * `data-chip-face`, and `[data-cf-grid] [data-chip-face]` zeroes the inline
   * padding in `styles/globals.css` — the grid CELL owns the whole horizontal
   * inset story there, so a chip value lands at the same x as a plain-text
   * value in the column above it. See {@link CHIP_FACE_ATTR}.
   */
  outerPad?: 'chip' | 'flush';
  /** When true, skip the global hover copy tooltip (e.g. chip has its own action menu). */
  disableTooltip?: boolean;
  /** `click` — site tooltip only on chip click; hover reserved for a separate action menu. */
  tooltipTrigger?: 'hover' | 'click';
  /** Smaller label + icons (mobile rows that must keep all chips on one line). */
  dense?: boolean;
  /** Replaces copy-on-click while preserving the standard chip presentation. */
  onActivate?: () => void;
  activationLabel?: string;
  activationTitle?: string;
  activationDisabled?: boolean;
  /**
   * Below-row editor is open for this chip. Face swaps to steady `editing`
   * (8 chars — same footprint as last-8 / `--------`) so the identity row
   * never reflows when an editor opens. No pulse — carton identity stays calm
   * while the below-row / push editor is open. Copy is disabled while editing.
   */
  editing?: boolean;
  /** Hover-bubble trailing icon; defaults to external-link when `onActivate` is set. */
  tooltipAction?: 'copy' | 'external-link';
  /**
   * Authoritative carrier for tracking tooltips (`FedEx 8751…`). Forwarded to
   * {@link useCopyChip} when `tone="tracking"`.
   */
  carrierHint?: string | null;
  /**
   * Catalog-resolved platform display name for id tooltips (`eBay 08-…`).
   * Forwarded to {@link useCopyChip} when `tone="id"`.
   */
  platformLabel?: string | null;
}

export function CopyChip({
  value,
  display,
  tone,
  icon,
  iconClass,
  iconStyle,
  width = 'w-fit max-w-full',
  disableCopy = false,
  truncateDisplay = true,
  fitDisplayWidth = false,
  displayWidth = 'content',
  onCopy,
  outerPad = 'chip',
  disableTooltip = false,
  tooltipTrigger = 'hover',
  dense = false,
  onActivate,
  activationLabel,
  activationTitle,
  activationDisabled = false,
  tooltipAction,
  editing = false,
  carrierHint = null,
  platformLabel = null,
}: CopyChipProps) {
  const resolvedTooltipAction = tooltipAction ?? (onActivate ? 'external-link' : 'copy');
  const faceDisplay = editing ? 'editing' : display;
  const {
    chipRef,
    hasTooltipProvider,
    openTooltip,
    closeTooltip,
    closeTooltipImmediate,
    tooltipLabel,
    canCopy,
    isDisabled,
    handleCopy,
    handleKeyDown,
    handleContextMenu,
    showTooltipPreview,
  } = useCopyChip({
    value,
    disableCopy: disableCopy || editing,
    disableTooltip: disableTooltip || editing,
    tooltipTrigger,
    onCopy,
    historyKind: tone,
    historyDisplay: faceDisplay,
    tooltipAction: resolvedTooltipAction,
    carrierHint: tone === 'tracking' ? carrierHint : null,
    platformLabel: tone === 'id' ? platformLabel : null,
  });

  const toneDef = tone ? CHIP_TONES[tone] : undefined;
  const resolvedIcon = icon === undefined ? toneDef?.icon : icon;
  const resolvedIconClass = iconClass ?? toneDef?.iconClass;

  // The site tooltip anchors to this wrapper's bounding rect. A block `div` with
  // `w-auto` stretches to the parent row, so the bubble centers on the row —
  // not the chip. fitDisplayWidth chips must shrink-wrap unless they pass an
  // explicit width (fixed column, flex-1 grow, etc.).
  const wrapperWidth =
    fitDisplayWidth && width === 'w-auto' ? 'w-fit max-w-full' : width;

  const normalizedDisplay = normalizeCopyText(faceDisplay);
  const displayOverflowClass = truncateDisplay ? 'truncate' : 'whitespace-nowrap';
  const displayWidthClass = displayWidth === 'last8' ? 'w-[8ch]' : '';
  const outerPx = outerPad === 'flush' ? 'px-0' : 'px-1.5';
  const hoverTooltipEnabled = !disableTooltip && !editing && tooltipTrigger === 'hover';

  return (
    <div
      ref={chipRef}
      {...CHIP_FACE_ATTR}
      className={`relative inline-flex items-center justify-start ${outerPx} ${wrapperWidth}`}
      onMouseEnter={hoverTooltipEnabled ? openTooltip : undefined}
      onMouseLeave={hoverTooltipEnabled ? closeTooltip : undefined}
    >
      {/* ds-raw-button: quiet mono chip face — tone via icon; click / ⌘C / right-click copies */}
      <button
        type="button"
        onClick={(e) => {
          if (!onActivate) {
            handleCopy(e);
            return;
          }
          e.stopPropagation();
          if (!activationDisabled) {
            if (tooltipTrigger === 'click') showTooltipPreview();
            onActivate();
          }
        }}
        onKeyDown={handleKeyDown}
        onContextMenu={onActivate ? undefined : handleContextMenu}
        onFocus={!disableTooltip && tooltipTrigger !== 'click' ? openTooltip : undefined}
        onBlur={!disableTooltip && tooltipTrigger !== 'click' ? closeTooltipImmediate : undefined}
        disabled={onActivate ? activationDisabled : isDisabled}
        aria-label={
          editing
            ? 'Editing — open field below'
            : onActivate
              ? activationLabel
              : undefined
        }
        aria-busy={editing || undefined}
        title={
          editing
            ? undefined
            : !disableTooltip && hasTooltipProvider && canCopy
              ? undefined
              : onActivate
                ? activationTitle
                : !disableTooltip && canCopy
                  ? tooltipLabel
                  : undefined
        }
        className={
          fitDisplayWidth
            ? 'inline-flex w-auto max-w-full items-center justify-start gap-0.5 py-0 bg-transparent text-left text-black transition-all active:scale-95 disabled:opacity-30'
            : 'inline-flex w-full max-w-full items-center justify-start gap-0.5 py-0 bg-transparent text-left text-black transition-all active:scale-95 disabled:opacity-30'
        }
      >
        {resolvedIcon ? (
          <span
            className={`inline-flex shrink-0 items-center justify-center ${
              dense
                ? 'h-3.5 w-3.5 [&_svg]:h-3.5 [&_svg]:w-3.5'
                : 'h-4 w-4 [&_svg]:h-4 [&_svg]:w-4'
            } ${resolvedIconClass ?? ''}`}
            style={iconStyle}
          >
            {resolvedIcon}
          </span>
        ) : null}
        <span
          className={`${dense ? chipText : `${monoValue} tracking-tight leading-none`} ${displayWidthClass} text-left ${displayOverflowClass} ${
            fitDisplayWidth ? 'min-w-0 shrink-0' : 'min-w-0 flex-1'
          } ${
            isEmptyChipDisplay(faceDisplay) ? 'text-text-faint' : dense ? 'text-text-default' : ''
          }${editing ? ' text-text-muted' : ''}`}
        >
          {normalizedDisplay || QUIET_CHIP_EMPTY}
        </span>
      </button>
    </div>
  );
}

// --- Pre-configured chips ---

/**
 * Internal order ID. Gray / Hash icon. Do NOT use for tracking numbers or FNSKUs.
 * `plain` drops the leading hash glyph (Sheets-like queue grid, where the column
 * header already labels "Order") while keeping copy + last-8 mono value.
 */
export const OrderIdChip = ({
  value,
  display,
  dense,
  plain,
  platformLabel,
  iconClass,
  iconStyle,
  displayWidth = 'content',
  truncateDisplay = true,
  fitDisplayWidth = false,
}: {
  value: string;
  display: string;
  dense?: boolean;
  /** Omit the leading hash icon — used by the quiet queue-grid identity cells. */
  plain?: boolean;
  /** Catalog-resolved platform name for the full-value hover label. */
  platformLabel?: string | null;
  /** Platform accent on the `#` glyph (`platformMetaIconTone`). */
  iconClass?: string;
  iconStyle?: React.CSSProperties;
  /** Fixed last-8 footprint for peek / identity headers. */
  displayWidth?: 'content' | 'last8';
  /** Grid tracks: keep last-8 fully visible (no `33…` ellipsis). */
  truncateDisplay?: boolean;
  fitDisplayWidth?: boolean;
}) => (
  <CopyChip
    value={value}
    display={resolveChipDisplay(display)}
    tone="id"
    icon={plain ? null : undefined}
    iconClass={plain ? undefined : iconClass}
    iconStyle={plain ? undefined : iconStyle}
    dense={dense}
    platformLabel={platformLabel}
    displayWidth={displayWidth}
    truncateDisplay={truncateDisplay}
    fitDisplayWidth={fitDisplayWidth}
    // Empty → quiet em dash (resolveChipDisplay / 2B); disable copy so the button
    // stays full-opacity instead of the no-value disabled fade.
    disableCopy={isEmptyDisplayValue(value)}
  />
);

/**
 * Reserves the same width as {@link OrderIdChip} when the real chip is omitted (e.g. SKU rows).
 * Keeps platform / tracking columns aligned with order-id rows.
 */
export function OrderIdChipPlaceholder({ plain }: { plain?: boolean } = {}) {
  return (
    <span className="pointer-events-none inline-flex shrink-0 select-none invisible" aria-hidden>
      <OrderIdChip value="00000000" display="00000000" plain={plain} />
    </span>
  );
}

/**
 * Purchase order number (vendor PO# / extracted from emails). Gray / Hash icon.
 *
 * Visually matches {@link OrderIdChip} (also gray + hash) — both represent
 * "an identifier this row is keyed by" and live in the left/primary
 * position of their respective row layouts. {@link TrackingChip} stays
 * blue for carrier tracking, which is a different concept (a physical
 * package, not an identifier).
 */
export const PoChip = ({
  value,
  display,
  dense,
  platformLabel,
  iconClass,
  iconStyle,
  displayWidth = 'content',
  fitDisplayWidth = false,
  disableCopy,
  width = 'w-fit max-w-full',
}: {
  value: string;
  /**
   * Override the face. Defaults to the house last-8 preview — do not pass
   * `getLast8(value)` by hand; that is the default.
   */
  display?: string;
  dense?: boolean;
  /** Catalog-resolved source-platform name for the full-value hover label. */
  platformLabel?: string | null;
  /** Platform accent on the `#` glyph (`platformMetaIconTone`). */
  iconClass?: string;
  iconStyle?: React.CSSProperties;
  /** Fixed last-8 footprint for peek / identity headers. */
  displayWidth?: 'content' | 'last8';
  fitDisplayWidth?: boolean;
  disableCopy?: boolean;
  width?: string;
}) => (
  <CopyChip
    value={value}
    // Last-8 is the display SoT for EVERY typed id chip (`copy-chip-format.ts`),
    // and this chip is the one that never baked it: six of its seven call sites
    // were passing `display={getLast8(value)}` by hand, so the derivation lived
    // in six places and the seventh — a new one — silently rendered a full PO
    // beside a last-8 tracking. Defaulting it here is the mapping moving to its
    // one module; the explicit call sites keep passing an identical value.
    display={resolveChipDisplay(display ?? getLast8(value))}
    tone="id"
    iconClass={iconClass}
    iconStyle={iconStyle}
    dense={dense}
    platformLabel={platformLabel}
    displayWidth={displayWidth}
    fitDisplayWidth={fitDisplayWidth}
    width={width}
    disableCopy={disableCopy}
  />
);

/**
 * Carrier shipping tracking number. Blue / MapPin by default; known carriers
 * override the mark with {@link CarrierMark} brand hex (UPS brown, FedEx purple…).
 * DESIGN SYSTEM RULE: Use ONLY for outbound carrier tracking numbers (UPS, FedEx, USPS…).
 * Do NOT use FNSKU codes — use FnskuChip (purple/Package) for those.
 */
export const TrackingChip = ({
  value,
  disableCopy,
  width = 'w-fit max-w-full',
  /** When false, renders copy label only — use with a separate leading icon column so rows align across the FBA sidebar. */
  showIcon = true,
  /**
   * Authoritative carrier from the shipment / label. Prefer over regex detect
   * for brand paint (same ladder as Open URL).
   */
  carrierHint = null,
  /**
   * Default true — underline hugs the mono label (last-8 preview). Prevents full-width underline when the wrapper
   * sits in a wide grid/flex slot (e.g. FBA tracking bundle header beside “N SKUs · M units”).
   */
  fitDisplayWidth = true,
  /** Fixed last-8 footprint — same as OrderIdChip / PoChip in peek headers. */
  displayWidth = 'content',
  dense,
  disableTooltip = false,
}: {
  value: string;
  /** @deprecated Tracking labels are always derived from `value` as last eight. */
  display?: string;
  disableCopy?: boolean;
  /** Tailwind width utilities on the wrapper (sidebar grids need `min-w-0 flex-1`). */
  width?: string;
  showIcon?: boolean;
  carrierHint?: string | null;
  fitDisplayWidth?: boolean;
  displayWidth?: 'content' | 'last8';
  dense?: boolean;
  /** Skip the site hover copy bubble — click still copies. */
  disableTooltip?: boolean;
}) => {
  const brand = resolveCarrierBrand(value, carrierHint);
  const brandPaint = hasCarrierBrandPaint(brand);
  return (
    <CopyChip
      value={value}
      display={resolveChipDisplay(getLast8(value))}
      tone="tracking"
      icon={
        showIcon
          ? brandPaint
            ? <CarrierMark meta={brand} footprint="chip" />
            : undefined
          : null
      }
      // Brand mark carries its own hex; don't force house blue on top.
      iconClass={
        showIcon && brandPaint
          ? 'text-inherit'
          : undefined
      }
      width={width}
      // Empty → quiet em dash; disable copy so the button stays full-opacity
      // instead of the no-value disabled fade.
      disableCopy={disableCopy || isEmptyDisplayValue(value)}
      disableTooltip={disableTooltip}
      outerPad={showIcon ? 'chip' : 'flush'}
      fitDisplayWidth={fitDisplayWidth}
      displayWidth={displayWidth}
      dense={dense}
      carrierHint={carrierHint}
    />
  );
};

/**
 * Marketplace listing URL: open link (left) + copy full URL (truncated preview label).
 * Caller supplies {@link previewDisplay} (e.g. host + clipped path).
 */
export function ListingUrlChip({
  rawUrl,
  openHref,
  previewDisplay,
}: {
  rawUrl: string;
  openHref: string | null;
  previewDisplay: string;
}) {
  const trimmed = normalizeCopyText(rawUrl);
  const preview = normalizeCopyText(previewDisplay);
  const chipDisplay = trimmed ? preview || '—' : '—';

  return (
    <div className="flex min-w-0 flex-1 basis-0 items-center gap-0.5">
      <HoverTooltip label={openHref ? 'Open link' : 'No valid URL'} asChild>
        <IconButton
          icon={<ExternalLink className="h-3.5 w-3.5 shrink-0" />}
          tone="accent"
          disabled={openHref == null}
          onClick={(e) => {
            e.stopPropagation();
            if (openHref) window.open(openHref, '_blank', 'noopener,noreferrer');
          }}
          ariaLabel="Open listing URL in new tab"
          className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded hover:bg-surface-sunken"
        />
      </HoverTooltip>
      <CopyChip
        value={trimmed}
        display={chipDisplay}
        iconClass="text-indigo-500"
        width="min-w-0 flex-1 max-w-full"
        disableCopy={!trimmed}
      />
    </div>
  );
}

/**
 * Static SKU code shown where a tracking column is reused (e.g. `SKU:qty`). Yellow / pencil — not carrier tracking.
 */
export const SkuScanRefChip = ({
  value,
  display,
  onCopy,
  dense,
  fitDisplayWidth = false,
  displayWidth = 'content',
}: {
  value: string;
  display: string;
  onCopy?: (value: string) => void;
  dense?: boolean;
  /** Peek / dense stacks pass true so SKU shares the Order/Tracking face box. */
  fitDisplayWidth?: boolean;
  displayWidth?: 'content' | 'last8';
}) => (
  <CopyChip
    value={value}
    display={resolveChipDisplay(display)}
    tone="sku"
    onCopy={onCopy}
    dense={dense}
    fitDisplayWidth={fitDisplayWidth}
    displayWidth={displayWidth}
  />
);

/**
 * Empty SKU slot on a PO-line meta row — mono `--------` matching a dense
 * {@link SkuScanRefChip} footprint (same pencil tone, same 8ch width). Quiet
 * face (no bottom rule). Presentational only (no copy button) so accordion
 * row clicks stay on the row. Used by blank matched SKUs and the empty unfound stub.
 *
 * Do NOT route through {@link AddValueChipFace}: its non-mono micro label
 * stacks short hyphens unevenly and does not read as an 8-char empty chip.
 */
export function EmptySkuChipFace({ dense = true }: { dense?: boolean } = {}) {
  const tone = CHIP_TONES.sku;
  return (
    <span
      {...CHIP_FACE_ATTR}
      className="relative inline-flex w-fit max-w-full items-center justify-start px-1.5"
      aria-label="No SKU"
    >
      <span className="inline-flex max-w-full items-center justify-start gap-0.5 py-0">
        <span className={`shrink-0 ${dense ? '[&_svg]:h-3.5 [&_svg]:w-3.5' : ''} ${tone.iconClass}`}>
          {tone.icon}
        </span>
        <span
          className={`${
            dense ? `${chipText} text-text-default` : `${monoValue} tracking-tight leading-none`
          } text-left`}
        >
          {EMPTY_CHIP_DISPLAY}
        </span>
      </span>
    </span>
  );
}

/**
 * Zoho PO unit cost on a receiving line. Receipt mark + quiet amount face
 * (`88.77` — the `$` stays in the copy payload only). Copies the full formatted
 * string (`$88.77`). Dense LedgerGrid Price cells pass {@link showIcon} false
 * via column `omitCellIcon` (header glyph still names the type).
 *
 * Pass `amount={null}` / missing / non-positive for an unfound or unpriced line:
 * still paints the Receipt mark + honest `—` so the meta price column never
 * collapses to a blank cell.
 */
export const UnitPriceChip = ({
  amount,
  dense,
  showIcon = true,
}: {
  amount: number | string | null | undefined;
  dense?: boolean;
  /** When false, omit the tone Receipt mark. */
  showIcon?: boolean;
}) => {
  const n = amount == null || amount === '' ? NaN : Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return (
      <CopyChip
        value=""
        display="—"
        tone="price"
        icon={showIcon ? undefined : null}
        truncateDisplay={false}
        fitDisplayWidth
        dense={dense}
        disableCopy
      />
    );
  }
  const numeric = n.toFixed(2);
  const formatted = `$${numeric}`;
  return (
    <CopyChip
      value={formatted}
      display={numeric}
      tone="price"
      icon={showIcon ? undefined : null}
      truncateDisplay={false}
      fitDisplayWidth
      dense={dense}
    />
  );
};

/**
 * Condition grade on a PO line meta row. Tags icon + quiet label; hue comes
 * from `src/lib/condition-tone.ts` (same registry as {@link ConditionPills}).
 */
export const ConditionGradeChip = ({
  grade,
  dense,
}: {
  grade: string | null | undefined;
  dense?: boolean;
}) => {
  const { iconClass, isPending } = conditionGradeChipStyleOrPending(grade);
  const code = String(grade || '').trim().toUpperCase();
  const label = isPending ? '---' : conditionGradeTableLabel(code);
  return (
    <CopyChip
      value={isPending ? '' : code}
      display={label}
      icon={<Tags className="h-4 w-4 shrink-0" />}
      iconClass={iconClass}
      disableCopy={isPending}
      truncateDisplay={false}
      fitDisplayWidth
      dense={dense}
    />
  );
};

/**
 * Picks blue carrier {@link TrackingChip} vs yellow {@link SkuScanRefChip} when the value contains `:`.
 * For SKU-formatted scans (`SKU:ID`), also renders an Ecwid {@link PlatformChip} that opens the
 * product search page using the base SKU (segment before `:`).
 * Label is always last 8 characters of the raw value (same for carrier and SKU scans).
 */
export function TrackingOrSkuScanChip({
  value,
  plain,
  dense = false,
  carrierHint = null,
}: {
  value: string;
  plain?: boolean;
  /** Caption-mono face for LedgerGrid Sheets body (never raw text-sm). */
  dense?: boolean;
  /** Stored/label carrier — brand paint + Open URL ladder. */
  carrierHint?: string | null;
}) {
  const raw = normalizeCopyText(value);
  const display = getLast8(raw);
  if (isSkuFormattedScanRef(raw)) {
    const sku = skuScanPrefixBeforeColon(raw);
    const productUrl = getExternalUrlByItemNumber(sku);
    return (
      <>
        <PlatformChip
          label="ecwid"
          iconClass="text-blue-600"
          onClick={() => {
            if (productUrl) window.open(productUrl, '_blank', 'noopener,noreferrer');
          }}
        />
        <SourceOrderChip value={sku} display={getLast8(sku)} dense={dense} />
        <SkuScanRefChip value={raw} display={display} dense={dense} />
      </>
    );
  }
  return (
    <TrackingChip
      value={raw}
      display={display}
      showIcon={!plain}
      dense={dense}
      carrierHint={carrierHint}
    />
  );
}

/**
 * Device / unit serial number. Emerald / Barcode icon.
 *
 * The label is derived internally from `value` via {@link resolveSerialDisplay},
 * so callers pass only the serial (or a comma-joined CSV) — no `getLast8Serial`
 * / empty-state handling at the call site. `display` is an optional override
 * (honored as-is after empty-state collapse) for rare cases like a batch
 * journey row whose sibling last-8s collide — see
 * `disambiguateSerialDisplays` in `@/lib/copy-chip-format`.
 */
export const SerialChip = ({
  value,
  display,
  width = 'w-[120px] shrink-0',
  disableTooltip = false,
  dense,
  pending,
  displayWidth = 'content',
  fitDisplayWidth = true,
  plain,
}: {
  value: string;
  /** Optional label override; normally derived from `value`. When set, used
   *  as-is after empty-state collapse (not re-last-8'd) so callers can pass a
   *  longer disambiguating suffix. */
  display?: string;
  /** Tailwind width utilities on the wrapper; default is a fixed width sized
   *  for the Barcode icon + 8-char mono value. Table rows pass a content-fit
   *  width so the serial column hugs its value like the other id chips. */
  width?: string;
  disableTooltip?: boolean;
  dense?: boolean;
  /** Optimistic add/remove — mutes the chip while the server round-trip is in flight. */
  pending?: OptimisticSerialFlag;
  /** Peek stacks pass `last8` so serial shares the Order/Tracking face box. */
  displayWidth?: 'content' | 'last8';
  /** Default true — peek spreads PEEK_FACE; keep shrink-wrap for tables. */
  fitDisplayWidth?: boolean;
  /**
   * Omit the leading Barcode glyph — the same switch {@link OrderIdChip} has.
   * SERIAL was the last identity chip with no way to go icon-less, so it was
   * the one Sheets cell that could not honour its column's `omitCellIcon` and
   * kept a body glyph while ORDER / TRACKING / PRICE beside it had dropped
   * theirs.
   */
  plain?: boolean;
}) => (
  <CopyChip
    value={value}
    display={
      display !== undefined
        ? resolveChipDisplay(display)
        : resolveSerialDisplay(value)
    }
    tone={pending === 'removing' ? 'id' : 'serial'}
    width={width}
    truncateDisplay={false}
    fitDisplayWidth={fitDisplayWidth}
    displayWidth={displayWidth}
    disableTooltip={disableTooltip}
    disableCopy={pending != null}
    dense={dense}
    icon={plain ? null : undefined}
    iconClass={
      plain
        ? undefined
        : pending === 'removing'
          ? 'text-text-faint'
          : pending === 'adding'
            ? 'text-emerald-400'
            : undefined
    }
  />
);

/**
 * Loading placeholder for a {@link SerialChip}. Emerald Barcode glyph + a pulsing
 * bar in the mono-value slot, carrying the same emerald tone and default
 * ~120px footprint so the PO-line meta row does not reflow when the real serial
 * streams in from the per-carton serials query. Reads as "serial loading", not
 * "no serial" — the empty state a bare gap would imply.
 *
 * Presentational + `aria-hidden`: the real {@link SerialChip} replaces it on
 * resolve, and one skeleton per line would otherwise spam a status announcement.
 * Mirrors {@link SerialChip}'s wrapper/icon classes and its
 * `fitDisplayWidth` shrink-wrap so the swap is pixel-stable; tone comes from the
 * shared {@link CHIP_TONES} `serial` entry (one hue SoT, no parallel color).
 */
export const SerialChipSkeleton = ({
  width = 'w-[120px] shrink-0',
  dense,
}: {
  /** Match the sibling {@link SerialChip} width so the swap doesn't reflow. */
  width?: string;
  dense?: boolean;
}) => {
  const tone = CHIP_TONES.serial;
  return (
    <div
      {...CHIP_FACE_ATTR}
      className={`relative inline-flex items-center justify-start px-1.5 ${width}`}
      aria-hidden
    >
      <span className="inline-flex w-auto max-w-full items-center justify-start gap-0.5">
        <span className={`shrink-0 ${tone.iconClass} ${dense ? '[&_svg]:h-3.5 [&_svg]:w-3.5' : ''}`}>
          {tone.icon}
        </span>
        <span className="inline-flex items-end">
          <span
            className={`${dense ? 'h-2.5' : 'h-3'} w-[4.5rem] max-w-full animate-pulse rounded bg-surface-strong`}
          />
        </span>
      </span>
    </div>
  );
};

/**
 * Serial sourced from the `sku` table (pack SKU rows or tech SKU_PULL). Yellow / pencil icon.
 * DESIGN SYSTEM RULE: Use only when the row is SKU-driven — not for carrier or FNSKU serials.
 */
export const SkuSerialChip = ({
  value,
  display,
  width = 'w-[120px] shrink-0',
}: {
  value: string;
  display: string;
  width?: string;
}) => (
  <CopyChip
    value={value}
    display={isEmptyDisplayValue(display) ? 'SKU' : getLast8Serial(display)}
    tone="sku"
    width={width}
    truncateDisplay={false}
    fitDisplayWidth
  />
);

export const TicketChip = ({
  value,
  display,
  dense = false,
  disableTooltip = false,
}: {
  value: string;
  display: string;
  /** Bookmark / dense chrome — smaller icon + caption mono. */
  dense?: boolean;
  /** Skip the site hover copy bubble — click still copies. */
  disableTooltip?: boolean;
}) => (
  <CopyChip
    value={value}
    display={display}
    tone="ticket"
    dense={dense}
    disableTooltip={disableTooltip}
  />
);
/** Bin / location barcode chip (teal / Tags). Prefer last-8 display for long barcodes. */
export const BinChip = ({
  value,
  display,
  dense,
}: {
  value: string;
  display?: string;
  dense?: boolean;
}) => (
  <CopyChip
    value={value}
    display={display ?? getLast8(value)}
    tone="bin"
    dense={dense}
    width="w-fit max-w-full"
  />
);

/**
 * Amazon FNSKU identifier (e.g. X001ABC123). Purple / Package icon.
 * DESIGN SYSTEM RULE: Use ONLY for FNSKU values scanned at FBA intake.
 * Do NOT use for carrier tracking numbers — use TrackingChip (blue/MapPin) for those.
 */
export const FnskuChip = ({ value, width }: { value: string; width?: string }) => (
  <CopyChip value={value} display={getLast8(value)} tone="fnsku" width={width} />
);

export const SourceOrderChip = ({
  value,
  display,
  width,
  disableCopy = false,
  dense,
}: {
  value: string;
  display: string;
  width?: string;
  disableCopy?: boolean;
  dense?: boolean;
}) => (
  <CopyChip
    value={value}
    display={display}
    tone="id"
    width={width}
    disableCopy={disableCopy}
    dense={dense}
  />
);

/**
 * The "empty slot, click to fill" affordance for an identity column — a colored
 * icon + muted label (no bottom rule). Quiet chips no longer use solid underlines
 * for filled values; empty-add stays icon + label so it still reads as an invite,
 * not a value. Shared by the Incoming "Add TRK#" popover trigger and the
 * dashboard paste-tracking button so the two surfaces can't drift.
 *
 * Presentational only — the caller owns the surrounding <button>/trigger and the
 * action (open a popover, paste from clipboard, …). Pass `colorClass` to recolor
 * for transient feedback (saving/success/error).
 */
export function AddValueChipFace({
  label,
  icon,
  colorClass = 'text-blue-600',
  dense = false,
  size = 'mini',
}: {
  label: string;
  icon: React.ReactNode;
  /** Icon + label text color. Override for status feedback (emerald/red). */
  colorClass?: string;
  dense?: boolean;
  /**
   * `mini` (default) — compact 8px label for popover triggers.
   * `chip` — 10px label sized so the empty face's total width matches a filled
   * {@link CopyChip} in a {@link ChipColumns} tracking slot (icon lands at the
   * same x, footprint is identical). Pass a `h-3.5 w-3.5` icon.
   */
  size?: 'mini' | 'chip';
}) {
  const labelSize = size === 'chip' ? 'text-role-micro' : dense ? 'text-role-caption' : 'text-role-micro';
  return (
    <span className={`inline-flex items-center gap-0.5 ${colorClass}`}>
      <span className={`shrink-0 ${dense ? '[&_svg]:h-3.5 [&_svg]:w-3.5' : ''}`}>{icon}</span>
      <span
        className={`${labelSize} whitespace-nowrap font-semibold leading-none tracking-tight opacity-80`}
      >
        {label}
      </span>
    </span>
  );
}

/** Platform chip — opens product page via item number on click, does NOT copy. */
export const PlatformChip = ({
  label,
  tooltipValue,
  labelTransform = 'lowercase',
  iconClass,
  onClick,
  showIcon = true,
}: {
  label: string;
  /** Full URL shown in the site tooltip; defaults to `Product Page`. */
  tooltipValue?: string;
  /** Preserve caller casing (e.g. `Product Page`) vs legacy lowercase platform slugs. */
  labelTransform?: 'lowercase' | 'none';
  iconClass: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Drop the leading external-link glyph (quiet queue-grid identity cell). */
  showIcon?: boolean;
}) => {
  const isEmpty = isEmptyChipDisplay(label);
  const resolvedTooltipValue = (tooltipValue ?? 'Product Page').trim();
  const { chipRef, openTooltip, closeTooltip } = useChipTooltip({
    enabled: !isEmpty && !!resolvedTooltipValue,
    tooltipValue: resolvedTooltipValue,
    tooltipAction: 'external-link',
  });

  const resolvedIconClass = isEmpty ? 'text-text-soft' : iconClass;
  const labelClass =
    labelTransform === 'none'
      ? isEmpty
        ? 'text-transparent select-none'
        : 'text-black'
      : isEmpty
        ? 'text-transparent select-none'
        : 'lowercase text-black';

  return (
    <div
      ref={chipRef}
      {...CHIP_FACE_ATTR}
      className="relative flex w-fit max-w-full items-center justify-start px-1.5"
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
    >
      {/* ds-raw-button: quiet platform face — tone via icon; click opens (no copy) */}
      <button
        type="button"
        disabled={isEmpty}
        onClick={(e) => {
          e.stopPropagation();
          if (isEmpty) return;
          onClick(e);
        }}
        className="inline-flex w-fit max-w-full items-center justify-start gap-0.5 py-0 bg-transparent text-left text-black transition-all active:scale-95 disabled:opacity-30"
      >
        {showIcon ? (
          <span className={`inline-flex shrink-0 items-center ${resolvedIconClass}`}>
            <ExternalLink className="h-4 w-4 shrink-0" />
          </span>
        ) : null}
        <span
          className={`${showIcon ? 'min-w-[60px] text-center' : 'min-w-[3ch] text-left'} whitespace-nowrap font-dm-sans text-sm font-semibold leading-none tracking-tight ${labelClass}`}
          aria-hidden={isEmpty}
        >
          {isEmpty ? '\u00a0' : label}
        </span>
      </button>
    </div>
  );
};

/**
 * Plain-cell click-to-copy — full visible string (not last-8). Same ritual as
 * {@link CopyChip} (hover tooltip → click copies → Copied flash) via
 * {@link useCopyChip}. Use for catalog SKU, bin barcode, and other extractable
 * ids that are not typed identity columns.
 */
export function CopyableCellValue({
  value,
  display,
  historyKind,
  className = '',
  dense = false,
  disableCopy = false,
}: {
  value: string | null | undefined;
  /** Optional shorter face; clipboard always uses the normalized full value. */
  display?: string;
  historyKind?: string;
  className?: string;
  dense?: boolean;
  disableCopy?: boolean;
}) {
  const face = display ?? value ?? '';
  const {
    chipRef,
    hasTooltipProvider,
    openTooltip,
    closeTooltip,
    closeTooltipImmediate,
    normalizedValue,
    canCopy,
    isDisabled,
    handleCopy,
    handleKeyDown,
    handleContextMenu,
  } = useCopyChip({
    value,
    disableCopy,
    historyKind,
    historyDisplay: face,
  });

  return (
    <div
      ref={chipRef}
      className="relative inline-flex min-w-0 max-w-full"
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
    >
      {/* ds-raw-button: plain mono cell face — click / ⌘C / right-click copies */}
      <button
        type="button"
        onClick={handleCopy}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onFocus={openTooltip}
        onBlur={closeTooltipImmediate}
        disabled={isDisabled}
        // ds-allow-title: OS fallback only when CopyChip tooltip provider is absent
        title={!hasTooltipProvider && canCopy ? normalizedValue : undefined}
        className={`min-w-0 max-w-full truncate text-left font-mono transition-colors hover:text-text-default disabled:opacity-40 ${
          dense ? 'text-role-caption' : 'text-role-data'
        } ${className}`}
      >
        {face}
      </button>
    </div>
  );
}
