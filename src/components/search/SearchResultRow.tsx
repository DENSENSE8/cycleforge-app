'use client';

/**
 * SearchResultRow — THE one rich search-result row renderer. Every search
 * surface (header preview, ⌘K, /search, operations, workbench quick-jumps)
 * renders through this so there is exactly one row (SoT: never fork a
 * per-surface renderer).
 *
 * Densities:
 *   • compact  — sidebar quick-jumps / rails. Title-first; no chip wall.
 *   • dropdown — header combobox preview. Strict CSS Grid tracks
 *     (Status · Id · Match · Tracking · Photos), sized to the 24rem find field
 *     the panel matches. Status leads so the eye reads state → identity →
 *     what → where across one line; the trailing cell is the pack-photo CTA
 *     (tracking-scoped media library). Relative age is comfortable-only —
 *     a sixth track leaves Match unreadably narrow at 24rem.
 *   • comfortable — full /search Monitor feed. Strict CSS Grid tracks
 *     (Glyph · Id · Match · Tracking · Age). Glyph = blue Package /
 *     PackageOpen leftmost. Id = OrderIdChip last-8. Match = title only.
 *     Tracking = TrackingChip last-8 on the right.
 *
 * Narrow law (compact): title + subtitle own the width; status is a leading
 * dot when known; trailing EntityTag and status/platform chips stay off;
 * optional tracking last-8 only. Viewport `md:` must never gate rail chrome
 * (sidebar is narrow on desktop too). `dropdown` still counts as narrow for
 * TITLE abbreviation (identifier titles show last-8) but is laid out on the
 * aligned grid above, not the free-flowing narrow row.
 *
 * Variants (narrow), chosen internally by entityType (callers never pass a flag):
 *   • order — status dot · title · meta · last-8 · when
 *   • unit  — serial badge · product title
 *   • generic — glyph/dot · title · subtitle
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Camera, History } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  TrackingChip,
  SerialChip,
  OrderIdChip,
  OrderIdChipPlaceholder,
  getLast8,
  getLast8Serial,
} from '@/components/ui/CopyChip';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { journeyHandoffHref, narrowSearchTitleDisplay } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { NearMatchPackout } from '@/hooks/useNearMatchPackout';
import { cn } from '@/utils/_cn';
import {
  CHIP_TONE_CLASSES,
  ENTITY_ICONS,
  ENTITY_TONE,
  orderStatusTone,
  type ChipTone,
} from './search-result-chips';
import {
  SEARCH_RESULT_DROPDOWN_GRID,
  SEARCH_RESULT_DROPDOWN_ROW_PAD,
  SEARCH_RESULT_GRID,
  SEARCH_RESULT_ROW_PAD,
} from './search-result-grid';
import { packPhotosLibraryHref } from '@/lib/photos/library-filter-state';
import {
  identityKindFor,
  orderIdFromHit,
  unitSerialFromHit,
} from '@/lib/search/search-result-identity';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';

export type SearchRowDensity = 'compact' | 'comfortable' | 'dropdown';

export interface SearchResultRowProps {
  hit: AiSearchHit;
  /** Keyboard-highlighted (combobox aria-activedescendant target). */
  active?: boolean;
  /** Stable id for role="option" / aria-activedescendant. */
  optionId?: string;
  /** Row scale — see file header. Default 'compact'. */
  density?: SearchRowDensity;
  /**
   * Called on mouse click. Receives the event so a host can intercept the
   * link (e.g. operations drills in-page via event.preventDefault()); hosts
   * that only close a popover can ignore the event and let the link navigate.
   */
  onNavigate?: (hit: AiSearchHit, event: ReactMouseEvent) => void;
  /**
   * Optional packout proof for the rep order-lookup rail — photos · packer ·
   * scan-out/packed time. Only the workbench rail supplies it; every other
   * caller omits it and the order row renders exactly as before.
   */
  packout?: NearMatchPackout;
  /**
   * Show the secondary "Open journey" affordance when the hit has a Trace
   * anchor. Default true; set false for hosts that own their own journey CTA.
   */
  showJourneyAction?: boolean;
  /**
   * Pack-photo count for the dropdown CTA. `null` = the batch read has not
   * settled yet; omit entirely on surfaces that do not paint the CTA.
   */
  packPhotoCount?: number | null;
}

// ── Per-density geometry ──────────────────────────────────────────────────────
const ROW_BY_DENSITY: Record<SearchRowDensity, string> = {
  compact: 'gap-3 px-3 py-1.5',
  comfortable: SEARCH_RESULT_ROW_PAD,
  dropdown: 'gap-2 px-3 py-2.5',
};
// Narrow rails keep caption-size titles so IDs stay scannable; comfortable
// uses body. (Dropdown used to be micro — that lost to the chip wall.)
const TITLE_BY_DENSITY: Record<SearchRowDensity, string> = {
  compact: 'text-role-caption',
  comfortable: 'text-role-body',
  dropdown: 'text-role-caption',
};
const ROW_BASE = 'group flex items-center text-left transition-colors hover:bg-surface-hover';
const ROW_ACTIVE = 'bg-blue-50 ring-1 ring-inset ring-blue-400';
// Comfortable-only chips — density-gated, never viewport `md:`.
const CHIP_BASE =
  'inline-flex shrink-0 rounded px-1.5 py-0.5 text-role-micro uppercase ring-1 ring-inset';

function isNarrowDensity(density: SearchRowDensity): boolean {
  return density === 'compact' || density === 'dropdown';
}

// Comfortable glyph tone — colour on the icon only (no padded tile).
const GLYPH_BY_TONE: Record<ChipTone, string> = {
  gray: 'text-text-soft',
  blue: 'text-blue-600',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
};

function Chip({ label, tone }: { label: string; tone: ChipTone | string }) {
  return (
    <span className={cn(CHIP_BASE, CHIP_TONE_CLASSES[tone] ?? CHIP_TONE_CLASSES.gray)}>{label}</span>
  );
}

/** Title text — last-8 when identifier-shaped; full value on HoverTooltip. */
function SearchTitle({
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
  const text = (
    <span
      className={cn(
        'truncate font-semibold text-text-default',
        // Narrow rails stack title above meta (`block`); comfortable is one-line.
        density === 'comfortable' ? 'inline' : 'block',
        TITLE_BY_DENSITY[density],
        info.abbreviated && 'font-mono tabular-nums',
      )}
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

/** Secondary CTA — Operations ▸ History Trace. Never changes row height. */
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

function journeyActionFor(
  hit: AiSearchHit,
  density: SearchRowDensity,
  show: boolean | undefined,
): ReactNode {
  if (show === false) return null;
  const href = journeyHandoffHref(hit);
  if (!href) return null;
  return <JourneyAction href={href} density={density} />;
}

/** Carrier + last-8 — always shown when tracking exists (density-gated, not md:). */
function TrackingMeta({
  tracking,
  carrier,
}: {
  tracking: string;
  carrier?: string | null;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {carrier && (
        <span className="text-role-eyebrow uppercase text-text-faint">{carrier}</span>
      )}
      <TrackingChip value={tracking} display={getLast8(tracking)} dense />
    </span>
  );
}

/**
 * Leading status cell (dropdown) — dot + word, so state reads without a
 * tooltip. Falls back to the entity glyph when the doc arm carried no status,
 * so the leftmost track is never an empty hole that breaks the column.
 */
function StatusLead({ hit }: { hit: AiSearchHit }) {
  const raw =
    hit.facets?.status ??
    hit.chips?.find((c) => c.tone === 'blue' || c.tone === 'amber' || c.tone === 'rose')?.label ??
    null;
  if (!raw) {
    return (
      <span className="flex items-center justify-center">
        <HoverTooltip label={hit.entityType} focusable={false}>
          <span className="flex items-center justify-center">
            <EntityTile entityType={hit.entityType} density="dropdown" />
          </span>
        </HoverTooltip>
      </span>
    );
  }
  const tone = orderStatusTone(raw);
  return (
    <HoverTooltip label={tone.label} focusable={false}>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1 rounded px-1 py-0.5 ring-1 ring-inset',
          CHIP_TONE_CLASSES[tone.tone] ?? CHIP_TONE_CLASSES.gray,
        )}
      >
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
        <span className="truncate text-role-micro uppercase">{tone.label}</span>
      </span>
    </HoverTooltip>
  );
}

/**
 * Trailing pack-photo CTA (dropdown) — painted on EVERY row, always, with a
 * real count. An affordance that appears only when photos exist forces the
 * operator to infer absence from a missing control; showing `0` says it.
 *
 * Scope is the tracking number: the media library resolves PACKER_LOG photos
 * through `packer_logs.shipment_id`, so no packerLogId lookup stands between
 * the row and the photos. `count === null` means the batch read has not
 * settled — the cell holds the number back rather than flashing a wrong 0.
 *
 * A row without tracking cannot be scoped, so its CTA renders inert at 0.
 */
function PackPhotosAction({
  tracking,
  count,
}: {
  tracking: string | null;
  count: number | null;
}) {
  const router = useRouter();
  const settled = count != null;
  const has = settled && count > 0;
  const label = !settled
    ? 'Counting packing photos…'
    : count === 0
      ? tracking
        ? 'No packing photos'
        : 'No packing photos (row has no tracking)'
      : `${count} packing photo${count === 1 ? '' : 's'}`;

  return (
    <HoverTooltip label={label} asChild>
      <button
        type="button"
        aria-label={label}
        disabled={!tracking}
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 tabular-nums',
          'text-role-micro transition-colors',
          has ? 'text-emerald-600' : 'text-text-faint',
          tracking ? 'hover:bg-surface-hover' : 'cursor-default',
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!tracking) return;
          router.push(packPhotosLibraryHref(tracking));
        }}
      >
        <Camera className="h-3.5 w-3.5" />
        {settled ? count : '·'}
      </button>
    </HoverTooltip>
  );
}

/**
 * The aligned row — ONE renderer for both column-aligned densities.
 *
 *   comfortable (/search Monitor feed):  Glyph  | Id | Match | Tracking | Age
 *   dropdown    (header find preview):   Status | Id | Match | Tracking | Photos
 *
 * The middle three tracks are identical in both, which is exactly why this is
 * one component and not two: only the LEAD cell (glyph vs status) and the TAIL
 * (journey overlay vs pack-photo CTA) differ. `compact` rails are genuinely a
 * different anatomy (free-flowing, stacked subtitle) and keep their own rows.
 */
function AlignedRow({
  hit,
  active,
  optionId,
  onNavigate,
  packout,
  showJourneyAction,
  packPhotoCount,
  density,
}: SearchResultRowProps & { density: 'comfortable' | 'dropdown' }) {
  const isDropdown = density === 'dropdown';
  const orderChannelLabel = useOrderChannelLabel();
  const facets = hit.facets ?? {};
  const tracking = facets.tracking_number?.trim() || null;
  const serial = unitSerialFromHit(hit);
  const orderId = orderIdFromHit(hit);
  const identityKind = identityKindFor(hit, orderId, serial, tracking);
  const accountSource = facets.source_platform?.trim() || null;
  const channelLabel =
    identityKind === 'order' && orderId ? orderChannelLabel(orderId, accountSource) : '';
  const channelMeta = sourcePlatformMetaFromLabel(channelLabel);
  const platformLabel =
    identityKind === 'order' && orderId
      ? channelMeta.value
        ? channelMeta.label
        : channelLabel || null
      : null;
  const whenSource = packout?.timeAt ?? facets.happened_at ?? null;
  const when = whenSource ? formatRelativeTime(whenSource) : null;
  const whenLabel = packout?.timeAt ? packout.timeLabel : null;
  const journey = isDropdown ? null : journeyActionFor(hit, density, showJourneyAction);

  return (
    <Link
      href={hit.href}
      onClick={(e) => {
        if (!onNavigate) return;
        // Host owns commit (header stays put until hit, then router.push).
        // Without preventDefault the Link href races and flips the URL first.
        e.preventDefault();
        onNavigate(hit, e);
      }}
      role="option"
      id={optionId}
      aria-selected={active || undefined}
      className={cn(
        'group relative text-left transition-colors hover:bg-surface-hover',
        isDropdown ? SEARCH_RESULT_DROPDOWN_GRID : SEARCH_RESULT_GRID,
        isDropdown ? SEARCH_RESULT_DROPDOWN_ROW_PAD : SEARCH_RESULT_ROW_PAD,
        active && ROW_ACTIVE,
      )}
    >
      {/* 1. Lead — status word (dropdown) / entity glyph (comfortable) */}
      {isDropdown ? (
        <StatusLead hit={hit} />
      ) : (
        <span className="flex items-center justify-center">
          <HoverTooltip label={hit.entityType} focusable={false}>
            <span className="flex items-center justify-center">
              <EntityTile entityType={hit.entityType} density={density} />
            </span>
          </HoverTooltip>
        </span>
      )}

      {/* 2. Id — order/PO last-8 (never tracking); platform via chip tooltip */}
      <span className="flex min-w-0 items-center justify-start">
        {identityKind === 'order' ? (
          <OrderIdChip
            value={orderId}
            display={getLast8(orderId)}
            dense
            platformLabel={platformLabel}
            truncateDisplay={false}
            fitDisplayWidth
          />
        ) : identityKind === 'serial' ? (
          <SerialChip value={serial} dense width="w-fit max-w-full shrink-0" />
        ) : (
          <OrderIdChipPlaceholder />
        )}
      </span>

      {/* 3. Match — title only (a subtitle would break the single-line grid) */}
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          <SearchTitle
            title={hit.title}
            density={density}
            forceFull={hit.entityType === 'order' || hit.entityType === 'receiving'}
          />
        </span>
        {!isDropdown && packout && packout.photoCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-role-micro uppercase text-emerald-600">
            <Camera className="h-3 w-3" />
            {packout.photoCount}
            {packout.packerName ? ` · ${packout.packerName}` : ''}
          </span>
        ) : null}
      </span>

      {/* 4. Tracking — right-side last-8; serial only when there is no tracking */}
      <span className="min-w-0 truncate">
        {tracking ? (
          <TrackingChip value={tracking} display={getLast8(tracking)} dense />
        ) : identityKind !== 'serial' && serial ? (
          <SerialChip value={serial} dense width="w-fit max-w-full shrink-0" />
        ) : null}
      </span>

      {/* 5. Age (+ journey overlay) — comfortable only; 24rem has no room */}
      {!isDropdown && (
        <span className="relative flex min-w-0 items-center justify-end gap-1">
          {when ? (
            <span className="truncate text-role-eyebrow uppercase tabular-nums text-text-faint">
              {whenLabel ? `${whenLabel} · ${when}` : when}
            </span>
          ) : null}
          {journey}
        </span>
      )}

      {/* 6. Packing photos CTA — dropdown only; always painted, count included */}
      {isDropdown && (
        <span className="flex items-center justify-end">
          <PackPhotosAction tracking={tracking} count={packPhotoCount ?? null} />
        </span>
      )}
    </Link>
  );
}


/** The Shopify-grade order row. Requires facets (doc-arm hits). Narrow only. */
function OrderRow({
  hit,
  active,
  optionId,
  density = 'compact',
  onNavigate,
  packout,
  showJourneyAction,
}: SearchResultRowProps) {
  const facets = hit.facets ?? {};
  const status = orderStatusTone(facets.status);
  const condition = facets.condition_grade;
  const platform = facets.source_platform;
  const tracking = facets.tracking_number;
  const carrier = facets.carrier;
  const narrow = isNarrowDensity(density);
  // Prefer the hydrated packout time (scan-out / packed) + its label; fall back
  // to the generic facet happened_at when the rail didn't hydrate this row.
  const whenSource = packout?.timeAt ?? facets.happened_at ?? null;
  const when = whenSource ? formatRelativeTime(whenSource) : null;
  const whenLabel = packout?.timeAt ? packout.timeLabel : null;

  return (
    <Link
      href={hit.href}
      onClick={(e) => {
        if (!onNavigate) return;
        // Host owns commit (header stays put until hit, then router.push).
        // Without preventDefault the Link href races and flips the URL first.
        e.preventDefault();
        onNavigate(hit, e);
      }}
      role="option"
      id={optionId}
      aria-selected={active || undefined}
      className={cn(ROW_BASE, ROW_BY_DENSITY[density], active && ROW_ACTIVE)}
    >
      <HoverTooltip label={status.label} focusable={false}>
        <span
          className={cn(
            'shrink-0 rounded-full',
            density === 'comfortable' ? 'h-2.5 w-2.5' : 'h-2 w-2',
            status.dot,
          )}
        />
      </HoverTooltip>
      <span className="min-w-0 flex-1">
        <SearchTitle title={hit.title} density={density} forceFull />
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
      </span>
      {/* Comfortable only — narrow rails keep title width. */}
      {!narrow && facets.status && <Chip label={facets.status} tone={status.tone} />}
      {!narrow && !packout && condition && <Chip label={condition} tone="amber" />}
      {!narrow && !packout && platform && <Chip label={platform} tone="gray" />}
      {/* Packout proof (rail only) — density-gated, not viewport md:. */}
      {packout && packout.photoCount > 0 && (
        <HoverTooltip
          label={`Photos ${packout.photoCount}`}
          focusable={false}
        >
          <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-role-micro uppercase text-emerald-600">
            <Camera className="h-3 w-3" />
            {packout.photoCount}
          </span>
        </HoverTooltip>
      )}
      {packout?.packerName && (
        <span className="max-w-[7rem] shrink-0 truncate text-role-eyebrow uppercase text-text-faint">
          {packout.packerName}
        </span>
      )}
      {!packout && tracking && <TrackingMeta tracking={tracking} carrier={carrier} />}
      {when && (
        <span className="shrink-0 text-role-eyebrow uppercase tabular-nums text-text-faint">
          {whenLabel ? `${whenLabel} · ${when}` : when}
        </span>
      )}
      {journeyActionFor(hit, density, showJourneyAction)}
    </Link>
  );
}

/** Serial-unit row — leads with a mono serial badge echoing the receiving view. */
function UnitRow({
  hit,
  active,
  optionId,
  density = 'compact',
  onNavigate,
  showJourneyAction,
}: SearchResultRowProps) {
  // The unit subtitle is `serial · sku · status` by builder contract; the first
  // segment is the serial. Echo the receiving carton chip (last-8 mono badge).
  const serial = (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
  const badge = serial ? getLast8Serial(serial) : '';
  const chips = hit.chips?.slice(0, 2) ?? [];
  const big = density === 'comfortable';
  const narrow = isNarrowDensity(density);

  return (
    <Link
      href={hit.href}
      onClick={(e) => {
        if (!onNavigate) return;
        // Host owns commit (header stays put until hit, then router.push).
        // Without preventDefault the Link href races and flips the URL first.
        e.preventDefault();
        onNavigate(hit, e);
      }}
      role="option"
      id={optionId}
      aria-selected={active || undefined}
      className={cn(ROW_BASE, ROW_BY_DENSITY[density], active && ROW_ACTIVE)}
    >
      {badge ? (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg font-mono font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 bg-emerald-50',
            big ? 'h-9 min-w-[3rem] px-2 text-role-data' : 'h-6 min-w-[2.5rem] px-1.5 text-role-micro',
          )}
        >
          {badge}
        </span>
      ) : (
        <EntityTile entityType="unit" density={density} />
      )}
      <span className="min-w-0 flex-1">
        <SearchTitle title={hit.title} density={density} />
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
      </span>
      {!narrow &&
        chips.map((chip) => (
          <Chip key={chip.label} label={chip.label} tone={chip.tone ?? 'gray'} />
        ))}
      {!narrow && <EntityTag entityType={hit.entityType} />}
      {journeyActionFor(hit, density, showJourneyAction)}
    </Link>
  );
}

/** The coloured leading glyph (comfortable) or bare glyph (compact). */
function EntityTile({ entityType, density }: { entityType: string; density: SearchRowDensity }) {
  const Icon = ENTITY_ICONS[entityType] || Search;
  const tone = ENTITY_TONE[entityType] ?? 'gray';
  if (density === 'compact' || density === 'dropdown') {
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
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center',
        GLYPH_BY_TONE[tone],
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** Right-edge entity type tag — comfortable density only. */
function EntityTag({ entityType }: { entityType: string }) {
  const tone = ENTITY_TONE[entityType] ?? 'gray';
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-1.5 py-0.5 text-role-micro uppercase ring-1 ring-inset',
        CHIP_TONE_CLASSES[tone],
      )}
    >
      {entityType}
    </span>
  );
}

/** Status dot when a status string is known (narrow generic rows). */
function StatusDot({ status, density }: { status: string; density: SearchRowDensity }) {
  const tone = orderStatusTone(status);
  return (
    <HoverTooltip label={tone.label} focusable={false}>
      <span
        className={cn(
          'shrink-0 rounded-full',
          density === 'comfortable' ? 'h-2.5 w-2.5' : 'h-2 w-2',
          tone.dot,
        )}
      />
    </HoverTooltip>
  );
}

/** Generic row (receiving, sku, repair, fba). */
function GenericRow({
  hit,
  active,
  optionId,
  density = 'compact',
  onNavigate,
  showJourneyAction,
}: SearchResultRowProps) {
  const narrow = isNarrowDensity(density);
  const status =
    hit.facets?.status ??
    hit.chips?.find((c) => c.tone === 'blue' || c.tone === 'amber' || c.tone === 'rose')?.label ??
    null;
  const tracking = hit.facets?.tracking_number ?? null;
  const carrier = hit.facets?.carrier ?? null;
  // When the title itself is the tracking #, last-8 lives in the title — skip
  // a redundant right-slot chip.
  const titleAbbrev = narrow ? narrowSearchTitleDisplay(hit.title).abbreviated : false;
  const showTrackingRight = Boolean(tracking) && !titleAbbrev;

  return (
    <Link
      href={hit.href}
      onClick={(e) => {
        if (!onNavigate) return;
        // Host owns commit (header stays put until hit, then router.push).
        // Without preventDefault the Link href races and flips the URL first.
        e.preventDefault();
        onNavigate(hit, e);
      }}
      role="option"
      id={optionId}
      aria-selected={active || undefined}
      className={cn(ROW_BASE, ROW_BY_DENSITY[density], active && ROW_ACTIVE)}
    >
      {narrow && status ? (
        <StatusDot status={status} density={density} />
      ) : (
        <EntityTile entityType={hit.entityType} density={density} />
      )}
      <span className="min-w-0 flex-1">
        <SearchTitle title={hit.title} density={density} />
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
      </span>
      {!narrow &&
        hit.chips?.slice(0, 2).map((chip) => (
          <Chip key={chip.label} label={chip.label} tone={chip.tone ?? 'gray'} />
        ))}
      {!narrow && <EntityTag entityType={hit.entityType} />}
      {narrow && showTrackingRight && tracking && (
        <TrackingMeta tracking={tracking} carrier={carrier} />
      )}
      {journeyActionFor(hit, density, showJourneyAction)}
    </Link>
  );
}

export function SearchResultRow(props: SearchResultRowProps) {
  const density = props.density ?? 'compact';
  // Both column-aligned densities share one renderer; only `compact` rails keep
  // the free-flowing narrow rows below.
  if (density === 'comfortable' || density === 'dropdown') {
    return <AlignedRow {...props} density={density} />;
  }
  // Order variant when the doc arm gave us facets to render richly, OR when the
  // rep workbench rail hydrated packout proof for it (so an exact-identifier
  // order hit still shows photos/packer/time instead of the bare generic row).
  if (props.hit.entityType === 'order' && (props.hit.facets != null || props.packout != null))
    return <OrderRow {...props} />;
  if (props.hit.entityType === 'unit') return <UnitRow {...props} />;
  return <GenericRow {...props} />;
}
