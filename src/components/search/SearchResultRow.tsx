'use client';

/**
 * SearchResultRow — THE one rich search-result row renderer. Every search
 * surface (header preview, ⌘K, /search, operations, workbench quick-jumps)
 * renders through this so there is exactly one row (SoT: never fork a
 * per-surface renderer).
 *
 * Two DENSITIES (+ header dropdown):
 *   • compact     — the header dropdown preview + sidebar quick-jumps. Tight
 *     rows, bare leading glyph. (Default — unchanged from the original.)
 *   • dropdown    — header combobox panel only: micro titles, tighter rows.
 *   • comfortable — the full results surface (/search + operations). Taller
 *     rows, a coloured entity tile, larger title, and — for serial units — a
 *     leading monospace serial badge that echoes the receiving carton display,
 *     so a serial you searched reads the same here as on the unit itself.
 *
 * Variants, chosen internally by entityType (callers never pass a flag):
 *   • order — Shopify-grade row: status dot · title · order#/sku/platform meta ·
 *     status+condition+platform chips · carrier + last-4 tracking · relative
 *     date. The dot AND the status chip both flow from orderStatusTone().
 *   • unit  — serial badge · product title · sku/status meta · chips.
 *   • generic — coloured entity tile · title · subtitle · ≤2 chips · type tag.
 *
 * The order variant needs facets. Exact-identifier hits carry NO facets, so
 * those render as the plain generic row (by design — do not "fix" a missing dot
 * on an exact hit). In operations/keyword scope facets are always present.
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Camera, History } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { TrackingChip, getLast4, getLast4Serial } from '@/components/ui/CopyChip';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { journeyHandoffHref } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { NearMatchPackout } from '@/hooks/useNearMatchPackout';
import { cn } from '@/utils/_cn';
import {
  CHIP_TONE_CLASSES,
  ENTITY_ICONS,
  orderStatusTone,
  type ChipTone,
} from './search-result-chips';

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
  comfortable: 'gap-3.5 px-4 py-3',
  dropdown: 'gap-2 px-3 py-1',
};
// Title role by density — type role is (near-)constant; the row's padding does
// the density work (plan §2.3-C). Compact = `role-caption` (12), comfortable =
// `role-body` (14). Callers add `font-semibold` (600) for the title weight.
const TITLE_BY_DENSITY: Record<SearchRowDensity, string> = {
  compact: 'text-role-caption',
  comfortable: 'text-role-body',
  dropdown: 'text-role-micro',
};
const ROW_BASE = 'group flex items-center text-left transition-colors hover:bg-surface-hover';
const ROW_ACTIVE = 'bg-blue-50 ring-1 ring-inset ring-blue-400';
// CF Type roles (plan §2.4): meta/eyebrows use `role-eyebrow` (11/600, no
// font-black), chips `role-micro` (10/600) — weight/tracking baked in the role.
const CHIP_BASE =
  'hidden shrink-0 rounded px-1.5 py-0.5 text-role-micro uppercase ring-1 ring-inset md:inline-flex';

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

/** The Shopify-grade order row. Requires facets (doc-arm hits). */
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
        <span className={cn('block truncate font-semibold text-text-default', TITLE_BY_DENSITY[density])}>
          {hit.title}
        </span>
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
      </span>
      {facets.status && <Chip label={facets.status} tone={status.tone} />}
      {/* On the rep rail (packout present) keep the row lean — title + status +
          proof — and drop the secondary condition/platform/tracking chips that
          would otherwise crowd out the product title in the narrow rail. */}
      {!packout && condition && <Chip label={condition} tone="amber" />}
      {!packout && platform && <Chip label={platform} tone="gray" />}
      {/* Packout proof (rail only) — photos ● and packer, equal-weight with status. */}
      {packout && packout.photoCount > 0 && (
        <HoverTooltip
          label={`${packout.photoCount} packing photo${packout.photoCount === 1 ? '' : 's'}`}
          focusable={false}
        >
          <span className="hidden shrink-0 items-center gap-0.5 tabular-nums text-role-micro uppercase text-emerald-600 md:inline-flex">
            <Camera className="h-3 w-3" />
            {packout.photoCount}
          </span>
        </HoverTooltip>
      )}
      {packout?.packerName && (
        <span className="hidden max-w-[7rem] shrink-0 truncate text-role-eyebrow uppercase text-text-faint md:inline-flex">
          {packout.packerName}
        </span>
      )}
      {!packout && tracking && (
        <span className="hidden shrink-0 items-center gap-1 md:inline-flex">
          {carrier && (
            <span className="text-role-eyebrow uppercase text-text-faint">
              {carrier}
            </span>
          )}
          <TrackingChip value={tracking} display={getLast4(tracking)} dense />
        </span>
      )}
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
        <span className={cn('block truncate font-semibold text-text-default', TITLE_BY_DENSITY[density])}>
          {hit.title}
        </span>
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
      </span>
      {chips.map((chip) => (
        <Chip key={chip.label} label={chip.label} tone={chip.tone ?? 'gray'} />
      ))}
      <EntityTag entityType={hit.entityType} density={density} />
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

/** Right-edge entity type tag — coloured in comfortable, neutral in compact. */
function EntityTag({ entityType, density }: { entityType: string; density: SearchRowDensity }) {
  const tone = ENTITY_TONE[entityType] ?? 'gray';
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-1.5 py-0.5 text-role-micro uppercase',
        density === 'comfortable'
          ? cn('ring-1 ring-inset', CHIP_TONE_CLASSES[tone])
          : 'bg-surface-sunken text-text-soft',
      )}
    >
      {entityType}
    </span>
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
  return (
    <Link
      href={hit.href}
      onClick={(e) => onNavigate?.(hit, e)}
      role="option"
      id={optionId}
      aria-selected={active || undefined}
      className={cn(ROW_BASE, ROW_BY_DENSITY[density], active && ROW_ACTIVE)}
    >
      <EntityTile entityType={hit.entityType} density={density} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-semibold text-text-default', TITLE_BY_DENSITY[density])}>
          {hit.title}
        </span>
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-role-eyebrow uppercase text-text-soft">
            {hit.subtitle}
          </span>
        )}
      </span>
      {hit.chips?.slice(0, 2).map((chip) => (
        <Chip key={chip.label} label={chip.label} tone={chip.tone ?? 'gray'} />
      ))}
      <EntityTag entityType={hit.entityType} density={density} />
      {journeyActionFor(hit, density, showJourneyAction)}
      {density === 'compact' && (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </Link>
  );
}

export function SearchResultRow(props: SearchResultRowProps) {
  // Order variant when the doc arm gave us facets to render richly, OR when the
  // rep workbench rail hydrated packout proof for it (so an exact-identifier
  // order hit still shows photos/packer/time instead of the bare generic row).
  if (props.hit.entityType === 'order' && (props.hit.facets != null || props.packout != null))
    return <OrderRow {...props} />;
  if (props.hit.entityType === 'unit') return <UnitRow {...props} />;
  return <GenericRow {...props} />;
}
