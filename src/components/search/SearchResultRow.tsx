'use client';

/**
 * SearchResultRow — THE one rich search-result row renderer. Every search
 * surface that paints a LIST of hits (⌘K, the header preview, rails, and the
 * phone `/m/search` plane) renders through this so there is exactly one row
 * (SoT: never fork a per-surface renderer). The DESK `/search` browse plane is
 * not a list at all — it is a DataTable mount on the `search-hits` family
 * (`READ_PLANE_IS_A_MOUNT`); the phone mounts this row instead.
 *
 * Densities:
 *   • compact  — phone `/m/search`, sidebar quick-jumps, rails. TWO LINES.
 *   • dropdown — header combobox / ⌘K preview. Name list with the three facts
 *     that are free to render and expensive to go and find: entity, state,
 *     channel. No aligned grid — the 24rem find field is too narrow for one.
 *   • comfortable — the aligned grid (Id · Status · Match · Tracking · Age)
 *     for any host with the width to spend on columns.
 *
 * ## Row anatomy law (operator 2026-09-12)
 *
 * 1. The VERIFIABLE IDENTIFIER owns the LEADING column, `font-mono
 *    tabular-nums`, right-aligned in its track, because a warehouse reader
 *    scans top-to-bottom down the left edge and the handle is what they are
 *    checking against a label. A text-heavy status word never takes that slot.
 * 2. STATUS is a minimal dot + a concise badge in ONE cluster beside the id
 *    ({@link StatusMark}) — never a coloured dot on one edge of the row and
 *    its word on the other, which splits one fact across the full width and
 *    costs two fixations to read a single state.
 * 3. The entity NOUN is not repeated under every title. On a scoped list it is
 *    the same word on every row, so it costs a line a real fact should own; on
 *    the mixed `/search` plane it is a sortable COLUMN instead.
 * 4. A relative stamp ("4d") is not enough for SLA work — the exact instant
 *    rides with it, on the hover at minimum.
 * 5. No 3-dot (⋮) menu: activation is the whole interaction, and search rows
 *    carry zero row menus by design.
 * 6. Chrome is gated on `density`, NEVER on a `md:`/`lg:` breakpoint — a
 *    desktop sidebar rail is narrow too, and a viewport query corrupts it.
 *
 * ## Narrow-row law (operator 2026-09-13) — the TITLE is the subject
 *
 * 7. **At `compact`, line one is IDENTITY · STATE · TITLE and nothing else.**
 *    Match meta, tracking, packout proof and age ride line two. Five faces on
 *    one line left the title 160px on a 390px phone, which printed every
 *    product in the list as the same truncated word.
 * 8. **A narrow title may take two lines** ({@link SearchTitle}), and its full
 *    value rides a native `title`, never a pointer-only tooltip. A list row is
 *    allowed to grow; that is what distinguishes it from a grid track, and it
 *    is why the phone gets a list and the desk gets the mount.
 *
 * ## Interaction law (operator 2026-09-13) — think mobile first
 *
 * 9. **PRESS is the primary state, hover is decoration.** Every row carries
 *    {@link TAPPABLE_ROW_CLASS}: `:active` tone, no tap delay, no competing
 *    browser tap-highlight box, an inset focus ring, and a 44px floor. A row
 *    whose only state is `hover:` has NO state on a phone, because Tailwind v4
 *    compiles `hover:` to `@media (hover: hover)`. Never hand-roll an
 *    `active:bg-*` here — the recipe lives in
 *    `@/design-system/tokens/interaction`.
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { Camera, Search } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  TrackingChip,
  SerialChip,
  getLast8,
  getLast8Serial,
} from '@/components/ui/CopyChip';
import { narrowSearchTitleDisplay } from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { NearMatchPackout } from '@/hooks/useNearMatchPackout';
import { cn } from '@/utils/_cn';
import {
  TAPPABLE_ROW_CLASS,
  TAP_MIN_H_CLASS,
} from '@/design-system/tokens/interaction';
import {
  ENTITY_ICONS,
  ENTITY_TONE,
  GLYPH_TONE_CLASSES as GLYPH_BY_TONE,
} from './search-result-chips';
import { SEARCH_RESULT_GRID, SEARCH_RESULT_ROW_PAD } from './search-result-grid';
import {
  AgeStamp,
  EntityTile,
  IdentityCell,
  SearchTitle,
  StatusMark,
  TrackingMeta,
  identityFor,
  journeyActionFor,
  type SearchRowDensity,
} from './search-result-faces';
import { orderIdFromHit } from '@/lib/search/search-result-identity';
import { useOrderChannelLabel, usePlatformMeta } from '@/hooks/useCatalog';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { PlatformMark } from '@/components/ui/PlatformMark';

/** Re-exported so the row stays the ONE public entry point for a search row. */
export type { SearchRowDensity };

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
//
// COMPACT is TWO LINES (operator 2026-09-13). See the `CompactRowShell` doc
// below for why; the pad grows because the row now has a second line and a
// 44px floor to clear.
const ROW_BY_DENSITY: Record<SearchRowDensity, string> = {
  compact: 'gap-2 px-3 py-2',
  comfortable: SEARCH_RESULT_ROW_PAD,
  dropdown: 'gap-2 px-3 py-2.5',
};

/**
 * Every row's shared base: the `group` the journey affordance hooks, left
 * alignment, and the INTERACTION contract — press, hover, focus and pointer
 * hygiene from {@link TAPPABLE_ROW_CLASS}.
 *
 * The press state is the point. This row used to carry `hover:bg-surface-hover`
 * and nothing else, and Tailwind v4 compiles `hover:` to
 * `@media (hover: hover)` — so on the surface the operator actually taps, the
 * row had no state at all: no press tone, no tap-delay suppression, and the
 * browser's own grey highlight box as the only feedback.
 */
const ROW_BASE = cn(
  'group flex text-left',
  TAP_MIN_H_CLASS,
  TAPPABLE_ROW_CLASS,
);
const ROW_ACTIVE = 'bg-blue-50 ring-1 ring-inset ring-blue-400';

/**
 * The props every search row's `Link` carries — href, commit handling, and the
 * listbox a11y contract.
 *
 * This was written out five times: once per renderer, including the same
 * `preventDefault` comment four times over. The rows genuinely differ in what
 * they PAINT — a unit leads with a serial badge, an order with an order chip —
 * but none of them differs in how it commits or how it announces itself to a
 * screen reader, and five copies of that is five chances for one row to quietly
 * stop being an `option`.
 */
interface SearchRowLinkProps {
  href: string;
  onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  role: 'option';
  id: string | undefined;
  'aria-selected': true | undefined;
}

function searchRowLinkProps(
  hit: AiSearchHit,
  active: boolean | undefined,
  optionId: string | undefined,
  onNavigate: SearchResultRowProps['onNavigate'],
): SearchRowLinkProps {
  return {
    href: hit.href,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!onNavigate) return;
      // Host owns commit (header stays put until hit, then router.push).
      // Without preventDefault the Link href races and flips the URL first.
      e.preventDefault();
      onNavigate(hit, e);
    },
    role: 'option' as const,
    id: optionId,
    'aria-selected': active || undefined,
  };
}

/**
 * The ⌘K palette row.
 *
 * Was title-only, which made every hit look the same: an operator scanning ten
 * results could not tell an eBay order from an Amazon one, a shipped row from a
 * returned one, or a unit from a carton, without opening something. It now
 * carries the three facts that are free to render and expensive to go and find
 * — entity type, order state, and channel — and nothing else, so the row still
 * reads in one glance.
 *
 * The state used to be a bare dot pinned to the trailing edge, the full width
 * away from the identity it describes and carrying no word at all. It is a
 * {@link StatusMark} beside the title now: one fact, one place.
 *
 * Channel colour comes from {@link usePlatformMeta}, the same catalog-aware
 * resolver the rails and grids use, so an org that recolours Amazon in its
 * platform catalog recolours it here too. Search does not get its own palette.
 */
function TitleOnlyDropdownRow({
  hit,
  active,
  optionId,
  onNavigate,
}: SearchResultRowProps) {
  const platformMeta = usePlatformMeta();
  const marketplaceId =
    hit.entityType === 'receiving'
      ? (hit.facets?.source_order_id?.trim() || orderIdFromHit(hit))
      : hit.entityType === 'order'
        ? orderIdFromHit(hit)
        : '';
  const tracking = hit.facets?.tracking_number?.trim() || '';
  const serial =
    hit.entityType === 'unit'
      ? String(hit.facets?.serial_number ?? hit.title ?? '').trim()
      : '';
  const identifier = marketplaceId || serial || tracking;
  const title = identifier || String(hit.title ?? '').trim() || 'Untitled';
  const primaryIsId = Boolean(identifier);
  const detail = primaryIsId
    ? [hit.entityType === 'order' ? hit.title : null, hit.subtitle]
        .map((s) => String(s ?? '').trim())
        .find((s) => s && s !== title) || ''
    : '';

  const Glyph = ENTITY_ICONS[hit.entityType] || Search;
  const entityTone = ENTITY_TONE[hit.entityType] ?? 'gray';
  // Status only means something for an order here; other entities would paint a
  // neutral mark that says nothing and costs the width a title needs.
  const status = hit.entityType === 'order' ? hit.facets?.status ?? null : null;
  const channel = hit.facets?.source_platform?.trim() || null;
  const channelMeta = channel ? platformMeta(channel) : null;
  return (
    <Link
      {...searchRowLinkProps(hit, active, optionId, onNavigate)}
      data-testid="global-find-hit"
      data-hit-title={title}
      data-hit-entity={hit.entityType}
      className={cn(
        'group flex min-w-0 items-center gap-2 px-3 py-2.5 text-left',
        TAP_MIN_H_CLASS,
        TAPPABLE_ROW_CLASS,
        active && ROW_ACTIVE,
      )}
    >
      <HoverTooltip label={hit.entityType} focusable={false}>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <Glyph className={cn('h-3.5 w-3.5', GLYPH_BY_TONE[entityTone])} />
        </span>
      </HoverTooltip>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 truncate text-role-caption font-semibold text-text-default',
              // An identifier reads as one, and its glyph advances line up with
              // the row above it.
              primaryIsId && 'font-mono tabular-nums',
            )}
          >
            {title}
          </span>
          {status ? <StatusMark status={status} density="dropdown" /> : null}
        </span>
        {detail ? (
          <span className="min-w-0 truncate text-role-micro text-text-muted">{detail}</span>
        ) : null}
      </span>

      {channelMeta ? (
        <HoverTooltip label={channelMeta.label} focusable={false}>
          <span className="flex shrink-0 items-center">
            <PlatformMark meta={channelMeta} />
          </span>
        </HoverTooltip>
      ) : null}
    </Link>
  );
}

/**
 * The aligned row — **Id · Status · Match · Tracking · Age**.
 *
 * The entity glyph that used to lead is gone: it was the same picture on every
 * row of a scoped list, and on a mixed list the entity is a fact that belongs
 * in a column that sorts (which is what the `/search` mount gives it). What
 * leads is the handle.
 */
function AlignedRow({
  hit,
  active,
  optionId,
  onNavigate,
  packout,
  showJourneyAction,
  density,
}: SearchResultRowProps & { density: 'comfortable' }) {
  const orderChannelLabel = useOrderChannelLabel();
  const facets = hit.facets ?? {};
  const { kind: identityKind, orderId, serial, tracking } = identityFor(hit);
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
  const whenLabel = packout?.timeAt ? packout.timeLabel : null;
  const journey = journeyActionFor(hit, density, showJourneyAction);

  return (
    <Link
      {...searchRowLinkProps(hit, active, optionId, onNavigate)}
      className={cn(
        'group relative text-left',
        TAPPABLE_ROW_CLASS,
        SEARCH_RESULT_GRID,
        SEARCH_RESULT_ROW_PAD,
        active && ROW_ACTIVE,
      )}
    >
      {/* 1. Id — the verifiable handle, right-aligned so the edge is one line */}
      <IdentityCell hit={hit} platformLabel={platformLabel} />

      {/* 2. Status — dot and word together, beside the id they qualify */}
      <span className="flex min-w-0 items-center">
        <StatusMark status={facets.status} density={density} />
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
        {packout && packout.photoCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-role-micro uppercase text-emerald-600">
            <Camera className="h-3 w-3" />
            {packout.photoCount}
            {packout.packerName ? ` · ${packout.packerName}` : ''}
          </span>
        ) : null}
      </span>

      {/* 4. Tracking — abbreviated; serial only when there is no tracking */}
      <span className="min-w-0 truncate">
        {tracking ? (
          <TrackingChip value={tracking} display={getLast8(tracking)} dense />
        ) : identityKind !== 'serial' && serial ? (
          <SerialChip value={serial} dense width="w-fit max-w-full shrink-0" />
        ) : null}
      </span>

      {/* 5. Age (+ journey overlay) — relative face, exact instant on hover */}
      <span className="relative flex min-w-0 items-center justify-end gap-1">
        <AgeStamp source={whenSource} label={whenLabel} />
        {journey}
      </span>
    </Link>
  );
}

/**
 * The COMPACT row skeleton — two lines (operator 2026-09-13).
 *
 * ## Why the title stopped fitting
 *
 * Compact was one line with five things on it: identity, state, title,
 * tracking, age. Four of those are fixed-width, so the title got whatever was
 * left — measured on a 390px phone, 160px. Product names are not 160px:
 * `Bose Wave Music System IV - Espresso Black` arrived as
 * `Bose Wave Music Syste…`, with its full value only on a pointer-only
 * tooltip. Every row in the list read as the same word.
 *
 * ## The law
 *
 * **Line one is the SUBJECT: identity · state · title, and nothing else.**
 * **Line two is the EVIDENCE: match meta, tracking, packout, age.**
 *
 * Moving two fixed-width faces off line one hands the title the rest of the
 * measure (~268px at 390, +68%), and {@link SearchTitle} then clamps to two
 * lines rather than truncating — so the subject is readable at the width the
 * operator actually holds.
 *
 * The 2026-09-12 anatomy law is intact and is the reason this is a skeleton
 * rather than a card: the identifier still owns the LEADING position on the
 * line the eye scans, `StatusMark` still sits WITH it as one cluster, and the
 * exact stamp still travels with the relative one. What moved is only which
 * line the secondary facts ride.
 *
 * One skeleton, because the three compact grammars (order / unit / generic)
 * differ in what they PAINT and not in how they are ARRANGED — which is the
 * same reason `searchRowLinkProps` exists.
 */
function CompactRowShell({
  linkProps,
  active,
  lead,
  title,
  meta,
}: {
  linkProps: SearchRowLinkProps;
  active?: boolean;
  /** Identity + state — the leading cluster on line one. */
  lead: ReactNode;
  /** The subject. */
  title: ReactNode;
  /** Line two. Renders nothing when every face in it is absent. */
  meta: ReactNode;
}) {
  return (
    <Link
      {...linkProps}
      className={cn(
        ROW_BASE,
        ROW_BY_DENSITY.compact,
        // `items-start`, not `items-center`: once the title may take two
        // lines, centring the leading identity against the block floats it
        // away from the line it identifies.
        'flex-col items-stretch',
        active && ROW_ACTIVE,
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        {lead}
        <span className="min-w-0 flex-1">{title}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-role-eyebrow uppercase text-text-soft">
        {meta}
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
  const tracking = facets.tracking_number;
  const carrier = facets.carrier;
  // Prefer the hydrated packout time (scan-out / packed) + its label; fall back
  // to the generic facet happened_at when the rail didn't hydrate this row.
  const whenSource = packout?.timeAt ?? facets.happened_at ?? null;
  const whenLabel = packout?.timeAt ? packout.timeLabel : null;

  return (
    <CompactRowShell
      linkProps={searchRowLinkProps(hit, active, optionId, onNavigate)}
      active={active}
      lead={
        <>
          {/* Id leads, then its state — one cluster, not two edges. */}
          <IdentityCell hit={hit} className="shrink-0" />
          <StatusMark status={facets.status} density={density} dotOnly />
        </>
      }
      title={<SearchTitle title={hit.title} density={density} forceFull />}
      meta={
        <>
          {hit.subtitle ? (
            <span className="min-w-0 flex-1 truncate">{hit.subtitle}</span>
          ) : (
            <span className="flex-1" />
          )}
          {/* Packout proof (rail only) — density-gated, not viewport md:. */}
          {packout && packout.photoCount > 0 && (
            <HoverTooltip label={`Photos ${packout.photoCount}`} focusable={false}>
              <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-role-micro uppercase text-emerald-600">
                <Camera className="h-3 w-3" />
                {packout.photoCount}
              </span>
            </HoverTooltip>
          )}
          {packout?.packerName && (
            <span className="max-w-[7rem] shrink-0 truncate text-text-faint">
              {packout.packerName}
            </span>
          )}
          {!packout && tracking && <TrackingMeta tracking={tracking} carrier={carrier} />}
          <AgeStamp source={whenSource} label={whenLabel} />
          {journeyActionFor(hit, density, showJourneyAction)}
        </>
      }
    />
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
  // segment is the serial. Echo the receiving carton chip (abbreviated mono).
  const serial = (hit.subtitle ?? '').split(' · ')[0]?.trim() || '';
  const badge = serial ? getLast8Serial(serial) : '';
  const status = hit.facets?.status ?? null;

  return (
    <CompactRowShell
      linkProps={searchRowLinkProps(hit, active, optionId, onNavigate)}
      active={active}
      lead={
        <>
          {badge ? (
            <span
              className={cn(
                'flex h-6 min-w-[2.5rem] shrink-0 items-center justify-end rounded-lg px-1.5',
                // Right-aligned mono figures: the serial column's edge is the
                // scanning line, and the badge must not be the one that wobbles.
                'font-mono tabular-nums font-semibold text-role-micro',
                'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
              )}
            >
              {badge}
            </span>
          ) : (
            <EntityTile entityType="unit" density={density} />
          )}
          {status ? <StatusMark status={status} density={density} dotOnly /> : null}
        </>
      }
      title={<SearchTitle title={hit.title} density={density} />}
      meta={
        <>
          {hit.subtitle ? (
            <span className="min-w-0 flex-1 truncate">{hit.subtitle}</span>
          ) : (
            <span className="flex-1" />
          )}
          {journeyActionFor(hit, density, showJourneyAction)}
        </>
      }
    />
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
  const status =
    hit.facets?.status ??
    hit.chips?.find((c) => c.tone === 'blue' || c.tone === 'amber' || c.tone === 'rose')?.label ??
    null;
  const { kind: identityKind, tracking } = identityFor(hit);
  const carrier = hit.facets?.carrier ?? null;
  // When the title itself is the tracking #, the abbreviation lives in the
  // title — skip a redundant right-slot chip.
  const titleAbbrev = narrowSearchTitleDisplay(hit.title).abbreviated;
  const showTrackingRight = Boolean(tracking) && !titleAbbrev;

  return (
    <CompactRowShell
      linkProps={searchRowLinkProps(hit, active, optionId, onNavigate)}
      active={active}
      lead={
        <>
          {identityKind === 'empty' ? (
            <EntityTile entityType={hit.entityType} density={density} />
          ) : (
            <IdentityCell hit={hit} className="shrink-0" />
          )}
          {status ? <StatusMark status={status} density={density} dotOnly /> : null}
        </>
      }
      title={<SearchTitle title={hit.title} density={density} />}
      meta={
        <>
          {hit.subtitle ? (
            <span className="min-w-0 flex-1 truncate">{hit.subtitle}</span>
          ) : (
            <span className="flex-1" />
          )}
          {showTrackingRight && tracking && (
            <TrackingMeta tracking={tracking} carrier={carrier} />
          )}
          {journeyActionFor(hit, density, showJourneyAction)}
        </>
      }
    />
  );
}

export function SearchResultRow(props: SearchResultRowProps) {
  const density = props.density ?? 'compact';
  if (density === 'dropdown') {
    return <TitleOnlyDropdownRow {...props} />;
  }
  // Column-aligned feed.
  if (density === 'comfortable') {
    return <AlignedRow {...props} density="comfortable" />;
  }
  // Order variant when the doc arm gave us facets to render richly, OR when the
  // rep workbench rail hydrated packout proof for it (so an exact-identifier
  // order hit still shows photos/packer/time instead of the bare generic row).
  if (props.hit.entityType === 'order' && (props.hit.facets != null || props.packout != null))
    return <OrderRow {...props} />;
  if (props.hit.entityType === 'unit') return <UnitRow {...props} />;
  return <GenericRow {...props} />;
}
