'use client';

/** The result row's LEAF FACES — the parts of a search row that paint one fact. */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Search, History } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  TrackingChip,
  SerialChip,
  OrderIdChip,
  OrderIdChipPlaceholder,
  getLast8,
} from '@/components/ui/CopyChip';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { journeyHandoffHref, narrowSearchTitleDisplay } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { CHIP_TONE_CLASSES, ENTITY_ICONS, orderStatusTone } from './search-result-chips';
import { SEARCH_RESULT_ID_CELL } from './search-result-grid';
import {
  identityKindFor,
  orderIdFromHit,
  unitSerialFromHit,
} from '@/lib/search/search-result-identity';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';

/** Row scale. See the `SearchResultRow` file header for what each one paints. */
export type SearchRowDensity = 'compact' | 'comfortable' | 'dropdown';

// Narrow rails keep caption-size titles so IDs stay scannable; comfortable
// uses body. (Dropdown used to be micro — that lost to the chip wall.)
const TITLE_BY_DENSITY: Record<SearchRowDensity, string> = {
  compact: 'text-role-caption',
  comfortable: 'text-role-body',
  dropdown: 'text-role-caption',
};

function isNarrowDensity(density: SearchRowDensity): boolean {
  return density === 'compact' || density === 'dropdown';
}

/** STATE, as one cluster: */
export function StatusMark({
  status,
  density,
  dotOnly = false,
}: {
  status: string | null | undefined;
  density: SearchRowDensity;
  dotOnly?: boolean;
}) {
  const tone = orderStatusTone(status);
  const dot = (
    <span
      className={cn(
        'shrink-0 rounded-full',
        density === 'comfortable' ? 'h-2 w-2' : 'h-1.5 w-1.5',
        tone.dot,
      )}
    />
  );
  if (dotOnly) {
    return (
      <HoverTooltip label={tone.label} focusable={false}>
        <span className="inline-flex shrink-0 items-center">{dot}</span>
      </HoverTooltip>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 ring-1 ring-inset',
        'text-role-micro',
        CHIP_TONE_CLASSES[tone.tone] ?? CHIP_TONE_CLASSES.gray,
      )}
    >
      {dot}
      <span className="truncate">{tone.label}</span>
    </span>
  );
}

/**
 * The TITLE — the row's subject.
 * ## It is allowed two lines at narrow measure (operator 2026-09-13)
 */
export function SearchTitle({
  title,
  density,
  forceFull = false,
}: {
  title: string;
  density: SearchRowDensity;
  /** Product titles on order rows stay full even when oddly shaped. */
  forceFull?: boolean;
}) {
  const info = forceFull
    ? { display: title, full: title, abbreviated: false }
    : isNarrowDensity(density)
      ? narrowSearchTitleDisplay(title)
      : { display: title, full: title, abbreviated: false };
  const oneLine = density === 'comfortable';
  const text = (
    <span
      className={cn(
        'font-semibold text-text-default',
        oneLine
          ? 'inline truncate'
          : // `line-clamp-2` brings its own `overflow-hidden` and needs normal
            // wrapping; `truncate`'s `whitespace-nowrap` would cancel it.
            'block whitespace-normal break-words line-clamp-2 text-pretty',
        TITLE_BY_DENSITY[density],
        info.abbreviated && 'font-mono tabular-nums',
      )}
      title={info.full}
    >
      {info.display}
    </span>
  );
  if (!info.abbreviated) return text;
  return (
    <HoverTooltip label={info.full} focusable={false}>
      {text}
    </HoverTooltip>
  );
}

/** The age face — relative for the glance, exact on the hover. */
export function AgeStamp({
  source,
  label,
  className,
}: {
  source: string | null | undefined;
  /** Family word in front of the age ("Packed"), when the host knows one. */
  label?: string | null;
  className?: string;
}) {
  if (!source) return null;
  const relative = formatRelativeTime(source);
  if (!relative) return null;
  const exact = formatDateTimePST(source);
  const face = label ? `${label} · ${relative}` : relative;
  return (
    <HoverTooltip label={exact} focusable={false}>
      <span
        className={cn(
          'shrink-0 truncate text-role-eyebrow tabular-nums text-text-faint',
          className,
        )}
        // Native title as the floor: the tooltip is pointer-only, and an exact
        // stamp that only exists on hover-with-a-mouse is not carried at all.
        title={exact}
      >
        {face}
      </span>
    </HoverTooltip>
  );
}

function JourneyAction({ href, density }: { href: string; density: SearchRowDensity }) {
  const router = useRouter();
  if (density === 'dropdown') return null;
  return (
    <HoverTooltip label="Open journey" asChild>
      <IconButton
        icon={<History className="h-3.5 w-3.5" />}
        size="xs"
        tone="neutral"
        ariaLabel="Open journey"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(href);
        }}
      />
    </HoverTooltip>
  );
}

export function journeyActionFor(
  hit: AiSearchHit,
  density: SearchRowDensity,
  show: boolean | undefined,
): ReactNode {
  if (show === false) return null;
  const href = journeyHandoffHref(hit);
  if (!href) return null;

}

/** Carrier + abbreviated tracking — always shown when tracking exists (density-gated, not `md:`). */
export function TrackingMeta({
  tracking,
  carrier,
}: {
  tracking: string;
  carrier?: string | null;
}) {
  const brand = resolveCarrierBrand(tracking, carrier);
  const paint = carrierBrandDotPaint(brand);
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <HoverTooltip label={brand.label} focusable={false}>
        <span className="inline-flex shrink-0 items-center">
          <BrandIdentityDot variant="ring" className={paint.className} style={paint.style} />
        </span>
      </HoverTooltip>
      <TrackingChip value={tracking} display={getLast8(tracking)} dense />
    </span>
  );
}

/**
 * The row's VERIFIABLE handle, and which chip paints it.
 *

 * disagree about what this row's identity is.
 */
export function identityFor(hit: AiSearchHit): {
  kind: 'order' | 'serial' | 'empty';
  orderId: string;
  serial: string;
  tracking: string | null;
} {
  const tracking = hit.facets?.tracking_number?.trim() || null;
  const orderId = orderIdFromHit(hit);
  const serial = unitSerialFromHit(hit);
  return { kind: identityKindFor(hit, orderId, serial, tracking), orderId, serial, tracking };
}

/** The leading identity cell — one chip, right-aligned, mono. */
export function IdentityCell({
  hit,
  platformLabel,
  className,
}: {
  hit: AiSearchHit;
  platformLabel?: string | null;
  className?: string;
}) {
  const { kind, orderId, serial } = identityFor(hit);
  return (
    <span className={cn(SEARCH_RESULT_ID_CELL, className)}>
      {kind === 'order' ? (
        <OrderIdChip
          value={orderId}
          display={getLast8(orderId)}
          dense
          platformLabel={platformLabel ?? null}
          truncateDisplay={false}
          fitDisplayWidth
        />
      ) : kind === 'serial' ? (
        <SerialChip value={serial} dense width="w-fit max-w-full shrink-0" />
      ) : (
        // Keeps the column edge when a hit has no quotable handle — an absent
        // id must not shift the next row's identity left.
        <OrderIdChipPlaceholder />
      )}
    </span>
  );
}

/** The bare entity glyph — the fallback lead when a row has no handle at all. */
export function EntityTile({ entityType, density }: { entityType: string; density: SearchRowDensity }) {
  const Icon = ENTITY_ICONS[entityType] || Search;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        density === 'dropdown' ? 'h-4 w-4' : 'h-5 w-5',
      )}
    >
      <Icon className={cn('text-text-faint', density === 'dropdown' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
    </span>
  );
}
