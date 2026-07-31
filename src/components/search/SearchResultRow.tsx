'use client';

/**
 * SearchResultRow — THE one rich search-result row renderer. Every search
 * surface (header preview, ⌘K, /search, operations, workbench quick-jumps)
 * renders through this so there is exactly one row (SoT: never fork a
 * per-surface renderer).
 *
 * Densities:
 *   • compact  — sidebar quick-jumps / rails. Title-first; no chip wall.
 *   • dropdown — header combobox preview. Same narrow anatomy, tighter pad.
 *   • comfortable — full /search Monitor feed. Strict CSS Grid tracks
 *     (Entity · Match · Status · Condition · Reference · Platform · Age).
 *
 * Narrow law (compact | dropdown): title + subtitle own the width; status is a
 * leading dot when known; trailing EntityTag and status/platform chips stay
 * off; optional tracking last-4 only. Viewport `md:` must never gate rail
 * chrome (sidebar is narrow on desktop too).
 *
 * Variants (narrow), chosen internally by entityType (callers never pass a flag):
 *   • order — status dot · title · meta · last-4 · when
 *   • unit  — serial badge · product title
 *   • generic — glyph/dot · title · subtitle
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Camera, History } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { TrackingChip, SerialChip, getLast4, getLast4Serial } from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { journeyHandoffHref, narrowSearchTitleDisplay } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { NearMatchPackout } from '@/hooks/useNearMatchPackout';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTone } from '@/lib/condition-tone';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import {
  CHIP_TONE_CLASSES,
  ENTITY_ICONS,
  orderStatusTone,
  type ChipTone,
} from './search-result-chips';
import { SEARCH_RESULT_GRID, SEARCH_RESULT_ROW_PAD } from './search-result-grid';

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
}

// ── Per-density geometry ──────────────────────────────────────────────────────
const ROW_BY_DENSITY: Record<SearchRowDensity, string> = {
  compact: 'gap-3 px-3 py-1.5',
  comfortable: SEARCH_RESULT_ROW_PAD,
  dropdown: 'gap-2 px-3 py-1',
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

// UI entity type → chip tone for the leading tile + type tag (sanctioned 5-tone
// families only — no new colours). Two entities may share a tone.
const ENTITY_TONE: Record<string, ChipTone> = {
  order: 'blue',
  unit: 'emerald',
  receiving: 'amber',
  sku: 'gray',
  repair: 'rose',
  fba: 'blue',
};
// Leading icon-tile classes per tone (soft fill + coloured glyph).
const TILE_BY_TONE: Record<ChipTone, string> = {
  gray: 'bg-surface-sunken text-text-soft',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
};

function Chip({ label, tone }: { label: string; tone: ChipTone | string }) {
  return (
    <span className={cn(CHIP_BASE, CHIP_TONE_CLASSES[tone] ?? CHIP_TONE_CLASSES.gray)}>{label}</span>
  );
}

/** Title text — last-4 when identifier-shaped; full value on HoverTooltip. */
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
        'block truncate font-semibold text-text-default',
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

/** Carrier + last-4 — always shown when tracking exists (density-gated, not md:). */
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
      <TrackingChip value={tracking} display={getLast4(tracking)} dense />
    </span>
  );
}

function unitSerialFromHit(hit: AiSearchHit): string {
  const fromFacet = hit.facets?.serial_number?.trim() ?? '';
  if (fromFacet) return fromFacet;
  if (hit.entityType !== 'unit') return '';
  return (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
}

/** Monitor feed — one aligned grid for every entity type. */
function ComfortableAlignedRow({
  hit,
  active,
  optionId,
  onNavigate,
  packout,
  showJourneyAction,
}: SearchResultRowProps) {
  const density: SearchRowDensity = 'comfortable';
  const facets = hit.facets ?? {};
  const statusRaw = facets.status ?? null;
  const status = statusRaw ? orderStatusTone(statusRaw) : null;
  const condition = facets.condition_grade?.trim() || null;
  const platform = facets.source_platform?.trim() || null;
  const tracking = facets.tracking_number?.trim() || null;
  const carrier = facets.carrier?.trim() || null;
  const serial = unitSerialFromHit(hit);
  const whenSource = packout?.timeAt ?? facets.happened_at ?? null;
  const when = whenSource ? formatRelativeTime(whenSource) : null;
  const whenLabel = packout?.timeAt ? packout.timeLabel : null;
  const conditionTone = condition ? conditionGradeTone(condition) : null;
  const journey = journeyActionFor(hit, density, showJourneyAction);

  return (
    <Link
      href={hit.href}
      onClick={(e) => onNavigate?.(hit, e)}
      role="option"
      id={optionId}
      aria-selected={active || undefined}
      className={cn(
        'group relative text-left transition-colors hover:bg-surface-hover',
        SEARCH_RESULT_GRID,
        SEARCH_RESULT_ROW_PAD,
        active && ROW_ACTIVE,
      )}
    >
      {/* 1. Entity */}
      <span className="flex min-w-0 items-center gap-1.5">
        <EntityTile entityType={hit.entityType} density={density} />
        <span className="text-role-micro uppercase text-text-soft">{hit.entityType}</span>
      </span>

      {/* 2. Match */}
      <span className="min-w-0">
        <SearchTitle
          title={hit.title}
          density={density}
          forceFull={hit.entityType === 'order'}
        />
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
        {hit.matchField ? (
          <span className="mt-0.5 block truncate text-role-micro text-text-faint">
            {hit.matchField}
          </span>
        ) : null}
        {packout && packout.photoCount > 0 && (
          <span className="mt-0.5 inline-flex items-center gap-0.5 tabular-nums text-role-micro uppercase text-emerald-600">
            <Camera className="h-3 w-3" />
            {packout.photoCount}
            {packout.packerName ? ` · ${packout.packerName}` : ''}
          </span>
        )}
      </span>

      {/* 3. Status */}
      <span className="min-w-0 truncate">
        {statusRaw && status ? <Chip label={statusRaw} tone={status.tone} /> : null}
      </span>

      {/* 4. Condition */}
      <span className="min-w-0 truncate">
        {condition && conditionTone ? (
          <span
            className={cn(
              'inline-flex shrink-0 rounded px-1.5 py-0.5 text-role-micro uppercase ring-1 ring-inset',
              conditionTone.badge,
            )}
          >
            {conditionLabel(condition, 'table')}
          </span>
        ) : null}
      </span>

      {/* 5. Reference — tracking XOR serial (polymorphic; never both columns) */}
      <span className="min-w-0 truncate">
        {tracking ? (
          <span className="inline-flex max-w-full items-center gap-1">
            {carrier ? (
              <span className="shrink-0 text-role-eyebrow uppercase text-text-faint">{carrier}</span>
            ) : null}
            <TrackingChip value={tracking} dense />
          </span>
        ) : serial ? (
          <SerialChip value={serial} dense width="w-fit max-w-full shrink-0" />
        ) : null}
      </span>

      {/* 6. Platform */}
      <span className="flex justify-center">
        {platform ? (
          <HoverTooltip label={sourcePlatformLabel(platform)} focusable={false}>
            <PlatformMark platformValue={platform} />
          </HoverTooltip>
        ) : null}
      </span>

      {/* 7. Age + journey overlay (journey does not steal a track) */}
      <span className="relative flex min-w-0 items-center justify-end gap-1">
        {when ? (
          <span className="truncate text-role-eyebrow uppercase tabular-nums text-text-faint">
            {whenLabel ? `${whenLabel} · ${when}` : when}
          </span>
        ) : null}
        {journey}
      </span>
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
      onClick={(e) => onNavigate?.(hit, e)}
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
          label={`${packout.photoCount} packing photo${packout.photoCount === 1 ? '' : 's'}`}
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
  // segment is the serial. Echo the receiving carton chip (last-4 mono badge).
  const serial = (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
  const badge = serial ? getLast4Serial(serial) : '';
  const chips = hit.chips?.slice(0, 2) ?? [];
  const big = density === 'comfortable';
  const narrow = isNarrowDensity(density);

  return (
    <Link
      href={hit.href}
      onClick={(e) => onNavigate?.(hit, e)}
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

/** The coloured leading tile (comfortable) or bare glyph (compact). */
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
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE_BY_TONE[tone])}>
      <Icon className="h-5 w-5" />
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
  // When the title itself is the tracking #, last-4 lives in the title — skip
  // a redundant right-slot chip.
  const titleAbbrev = narrow ? narrowSearchTitleDisplay(hit.title).abbreviated : false;
  const showTrackingRight = Boolean(tracking) && !titleAbbrev;

  return (
    <Link
      href={hit.href}
      onClick={(e) => onNavigate?.(hit, e)}
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
      {density === 'compact' && (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </Link>
  );
}

export function SearchResultRow(props: SearchResultRowProps) {
  if ((props.density ?? 'compact') === 'comfortable') {
    return <ComfortableAlignedRow {...props} />;
  }
  // Order variant when the doc arm gave us facets to render richly, OR when the
  // rep workbench rail hydrated packout proof for it (so an exact-identifier
  // order hit still shows photos/packer/time instead of the bare generic row).
  if (props.hit.entityType === 'order' && (props.hit.facets != null || props.packout != null))
    return <OrderRow {...props} />;
  if (props.hit.entityType === 'unit') return <UnitRow {...props} />;
  return <GenericRow {...props} />;
}
