'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-presets';
import type {
  TimelineItem,
  TimelineMedia,
  TimelineTone,
  TimelineRef,
  TimelineGroupKey,
} from '@/lib/timeline/types';
import { TIMELINE_OTHER_BAND_KEY } from '@/lib/timeline/types';
import { isRawStatusTrailSubtitle } from '@/lib/timeline/station-subtitle';
import { resolveTimelineGlyph } from '@/lib/timeline/timeline-glyphs';
import { ChevronRight } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TIMELINE_GLYPH_ICONS } from '@/components/ui/timeline-glyph-icons';
import { TimelineRefChip } from '@/components/ui/timeline-ref-chip';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import {
  resolveTimelineGalleryIndex,
  timelineMediaStripPreview,
} from '@/lib/timeline/timeline-media-strip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  STEP_NODE_STATE_CLASS,
  STEP_RAIL_LINE_CLASS,
  STEP_RAIL_LINE_LEFT,
  STEP_RAIL_NODE_CLASS,
  STEP_RAIL_NODE_SIZE,
} from '@/design-system/components/record-ledger/StepRail';
import { cn } from '@/utils/_cn';
import {
  formatDateKeyMedium,
  formatMonthDayTimePST,
  formatTime12hPST,
  getCurrentPSTDateKey,
  toPSTDateKey,
} from '@/utils/date';



/** Station / journey density: max preview slots (last becomes `+N` when more). */
const DEFAULT_MEDIA_THUMB_LIMIT = 4;

/** Shared, domain-agnostic event timeline — the vertical day-banded trail used by detail panels across the app (carrier events, order… */

const BADGE_TONE: Record<TimelineTone, string> = {
  default: 'bg-surface-sunken text-text-muted',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  fulfillment: STATE_TONE_CLASSES.fulfillment.pill,
  muted: 'bg-surface-sunken text-text-muted',
};

type Density = 'comfortable' | 'compact';
const DENSITY: Record<Density, { pb: string; day: string; glyphTop: string }> = {
  comfortable: { pb: 'pb-4', day: 'mt-5 first:mt-0', glyphTop: 'top-0' },
  compact: { pb: 'pb-3', day: 'mt-4 first:mt-0', glyphTop: 'top-px' },
};

/** Older events' node face — the StepRail node, quiet (solid edge, not the "not yet" dashes). */
const QUIET_NODE_CLASS = 'border border-mode-edge bg-mode-bar text-mode-muted';

/** Inline timeline thumbs → shared photo-gallery SoT (never a new browser tab). */
function TimelineMediaStrip({
  media,
  thumbLimit = DEFAULT_MEDIA_THUMB_LIMIT,
  galleryPhotos,
  galleryMatchIds,
}: {
  media: TimelineMedia[];
  thumbLimit?: number;
  galleryPhotos?: PhotoGalleryInput[];
  /** Parallel to `galleryPhotos` for id→index resolve when inputs are URL-only. */
  galleryMatchIds?: Array<number | null | undefined>;
}) {
  const stagePhotos = useMemo<PhotoGalleryInput[]>(
    () => media.map((m) => ({ url: m.fullUrl, thumbUrl: m.thumbUrl })),
    [media],
  );
  const photos = galleryPhotos && galleryPhotos.length > 0 ? galleryPhotos : stagePhotos;
  const gallery = usePhotoGallery({ photos });
  const { openViewer } = gallery;

  const galleryPhotoIds = useMemo(() => {
    if (galleryMatchIds && galleryMatchIds.length === photos.length) {
      return galleryMatchIds.map((id) =>
        typeof id === 'number' && Number.isFinite(id) ? id : null,
      );
    }
    return photos.map((p) =>
      typeof p === 'object' && typeof p.id === 'number' && Number.isFinite(p.id) ? p.id : null,
    );
  }, [galleryMatchIds, photos]);
  const galleryUrls = useMemo(
    () =>
      photos.map((p) => (typeof p === 'string' ? p.trim() : (p.url ?? '').trim())),
    [photos],
  );

  const { visibleCount, overflowCount } = timelineMediaStripPreview(media.length, thumbLimit);
  const visible = media.slice(0, visibleCount);

  const openAtMedia = (m: TimelineMedia, previewIndex: number) => {
    openViewer(
      resolveTimelineGalleryIndex({
        photoId: m.photoId,
        url: m.fullUrl,
        galleryPhotoIds,
        galleryUrls,
        fallbackIndex: previewIndex,
      }),
    );
  };

  const openOverflow = () => {
    const firstHidden = media[visibleCount];
    if (firstHidden) {
      openAtMedia(firstHidden, visibleCount);
      return;
    }
    openViewer(0);
  };

  return (
    <>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
        {visible.map((m, index) => (
          <button
            key={m.photoId}
            type="button"
            // ds-raw-button: photo thumb open — not a DS Button surface
            className="ds-raw-button block shrink-0 overflow-hidden rounded-mode-control ring-1 ring-inset ring-border-hairline transition-opacity hover:opacity-90"
            onClick={() => openAtMedia(m, index)}
            aria-label={m.caption ? `View ${m.caption} photo` : 'View photo'}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.thumbUrl}
              alt={m.caption ?? 'photo'}
              loading="lazy"
              className="h-12 w-12 object-cover"
            />
          </button>
        ))}
        {overflowCount > 0 ? (
          <button
            type="button"
            // ds-raw-button: +N overflow open — not a DS Button surface
            className="ds-raw-button flex h-12 w-12 shrink-0 items-center justify-center rounded-mode-control bg-surface-sunken text-role-caption font-semibold tabular-nums text-text-muted ring-1 ring-inset ring-border-hairline transition-opacity hover:opacity-90"
            onClick={openOverflow}
            aria-label={`View ${overflowCount} more photos`}
          >
            +{overflowCount}
          </button>
        ) : null}
      </div>
      {photos.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </>
  );
}

/** One clock format for every row, warehouse (PST) time: `3:25 PM` today, `Sep 24, 3:25 PM` otherwise. */
function clockLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return toPSTDateKey(value) === getCurrentPSTDateKey()
    ? formatTime12hPST(value)
    : formatMonthDayTimePST(value);
}

/**
 * Relative "2 days ago" label (the 2026-standard glanceable form) used when
 * `richTime` is on. Falls back to the clock time if the value can't be parsed.
 */
function relTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch {
    return clockLabel(value);
  }
}

/**
 * Full, timezone-aware absolute timestamp for the rich-time hover tooltip. Uses
 * `Intl` (not date-fns `z` tokens, which throw) so the operator's local zone
 * abbreviation is included — e.g. "Fri, Jun 27, 2026, 2:14:09 PM EDT".
 */
function absTimestamp(value: string | null | undefined): string {
  if (!value) return 'Unknown time';
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(parseISO(value));
  } catch {
    return value;
  }
}

/** Short kind label shown before the identifier chip in the serial-grouped view. */
const REF_KIND_LABEL: Record<TimelineRef['kind'], string> = {
  serial: 'Serial',
  tracking: 'Tracking',
  fnsku: 'FNSKU',
  sku: 'SKU',
  id: 'Order',
  bin: 'Bin',
  ticket: 'Ticket',
};

/** True when subtitle is only the same id the CopyChip already shows (optional collapse ×). */
function isRedundantRefSubtitle(subtitle: string, ref: TimelineRef | undefined): boolean {
  if (!ref?.value) return false;
  const norm = (s: string) => s.replace(/^#/, '').trim().toLowerCase();
  const refNorm = norm(ref.value);
  if (!refNorm) return false;
  // "#9462" or "#9462 · 2× · earliest 11:50am"
  const head = subtitle.split('·')[0]?.trim() ?? subtitle;
  return norm(head) === refNorm;
}

/** Collapse-only footnote when the id chip already carries identity ("2× · earliest …"). */
function collapseOnlyFootnote(subtitle: string, ref: TimelineRef | undefined): string | null {
  if (!ref?.value || !isRedundantRefSubtitle(subtitle, ref)) return null;
  const parts = subtitle.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(1).join(' · ');
}

/** Identity chips for a row — prefer `refs` cluster when present. */
function itemIdentityRefs(item: TimelineItem): TimelineRef[] {
  if (item.refs?.length) return item.refs;
  return item.ref ? [item.ref] : [];
}

/** Actor cell — name, prefixed by the staffer's photo when the adapter resolved a staff id. */
function ActorLabel({ item }: { item: TimelineItem }) {
  const staffId = item.actorStaffId;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 align-middle">
      {staffId ? (
        <StaffAvatar staffId={staffId} name={item.actor} size="xs" ring={false} />
      ) : null}
      <span className="truncate text-text-soft">{item.actor}</span>
    </span>
  );
}

/** How the rows are grouped: */
export type TimelineGroupMode = 'time' | 'serial';

interface EventTimelineProps {
  items: TimelineItem[];
  emptyMessage?: string;
  /** Group rows under "EEE, MMM d" day bands (default true). Ignored when
   *  `groupMode === 'serial'` (serial bands replace day bands). */
  groupByDay?: boolean;
  /** Ring + highlight the first (latest) row (default true). */
  highlightLatest?: boolean;
  /** Vertical rhythm — `compact` for sidebars, `comfortable` (default) for panels. */
  density?: Density;
  /** Identifier grouping (the serial↔order toggle). Default `time`. */
  groupMode?: TimelineGroupMode;
  /** Override how rows bucket into bands when `groupMode === 'serial'`. */
  groupKeyOf?: (item: TimelineItem) => TimelineGroupKey | null;
  /** Rich timestamps (the 2026-standard form): */
  richTime?: boolean;
  /**
   * Put time · actor immediately after the verb (flex gap) instead of far-right
   * justify-between. Alone: single-line trail. With {@link refInline}: Station
   * two-line anatomy (title primary; chip · time · actor secondary).
   */
  metaTrail?: boolean;
  /**
   * With {@link metaTrail}: Station two-line anatomy — id {@link CopyChip}
   * (serial last-8) on the secondary meta line, not beside the title.
   * Without metaTrail: legacy inline-on-title-row behavior.
   */
  refInline?: boolean;
  /** Serial mode only: */
  collapsibleGroups?: boolean;
  /** Serial mode only: */
  renderGroupHeader?: (group: TimelineGroupView) => ReactNode;
  /** Opt-in row activation (Monitor→detail drill). */
  onSelectItem?: (item: TimelineItem) => void;
  /** Optional lightbox set for every media strip on this timeline (e.g. */
  galleryPhotos?: PhotoGalleryInput[];
  /** Parallel photo ids for {@link galleryPhotos} (URL-only read galleries). */
  galleryMatchIds?: Array<number | null | undefined>;
  /** Max preview thumbs before a `+N` tile (default 4). */
  mediaThumbLimit?: number;
}

/** A serial-view band: an identifier header + that identifier's rows. */
interface SerialGroup {
  key: string;
  ref: TimelineRef | null;
  label: string;
  items: TimelineItem[];
}

/**
 * Public band shape handed to {@link EventTimelineProps.renderGroupHeader} so a
 * caller can render a custom band header without reaching into internals.
 */
export interface TimelineGroupView {
  key: string;
  ref: TimelineRef | null;
  label: string;
  items: TimelineItem[];
}

/** Bucket items by their `ref` identifier, preserving the incoming (sorted) order both for the rows inside a band and for the bands… */
function groupBySerial(
  items: TimelineItem[],
  groupKeyOf?: (item: TimelineItem) => TimelineGroupKey | null,
): SerialGroup[] {
  const map = new Map<string, SerialGroup>();
  const NO_REF = TIMELINE_OTHER_BAND_KEY;
  for (const it of items) {
    // The band a row belongs to is, by default, its own ref identifier. A caller
    // can override this with `groupKeyOf` to group by a chosen dimension
    // (order / serial / tracking) without mutating each row's own ref/chip.
    const gk =
      groupKeyOf?.(it) ??
      (it.ref ? { key: `${it.ref.kind}:${it.ref.value}`, label: it.ref.value, ref: it.ref } : null);
    const key = gk?.key ?? NO_REF;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        ref: gk?.ref ?? null,
        label: gk?.label ?? 'Order events',
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(it);
  }
  // Keep the ref-less "Order events" band last so identifiers lead the view.
  const groups = [...map.values()];
  groups.sort((a, b) => Number(a.key === NO_REF) - Number(b.key === NO_REF));
  return groups;
}

/** The built-in serial-band header: kind label + identifier chip + event count. */
function DefaultGroupHeader({ group }: { group: SerialGroup }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mode-label text-text-faint">
        {group.ref ? `${REF_KIND_LABEL[group.ref.kind]} ` : ''}
      </span>
      {group.ref ? (
        <TimelineRefChip refItem={group.ref} />
      ) : (
        <span className="mode-label text-text-faint">
          {group.label}
        </span>
      )}
      <span className="text-role-micro font-medium text-text-faint">
        {group.items.length} events
      </span>
    </div>
  );
}

/** Collapsed-band peek: the latest event's title + relative time, muted. */
function GroupLatestPeek({ items, richTime }: { items: TimelineItem[]; richTime: boolean }) {
  const latest = items[0];
  if (!latest) return null;
  const when = richTime ? relTime(latest.at) : clockLabel(latest.at);
  return (
    <span className="ml-auto hidden min-w-0 shrink items-center gap-1.5 truncate text-role-micro font-medium text-text-faint sm:flex">
      <span className="truncate">{latest.title}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-text-faint">· {when}</span>
    </span>
  );
}

export function EventTimeline({
  items,
  emptyMessage = 'No events yet.',
  groupByDay = true,
  highlightLatest = true,
  density = 'comfortable',
  groupMode = 'time',
  groupKeyOf,
  richTime = false,
  metaTrail = false,
  refInline = false,
  collapsibleGroups = false,
  renderGroupHeader,
  onSelectItem,
  galleryPhotos,
  galleryMatchIds,
  mediaThumbLimit = DEFAULT_MEDIA_THUMB_LIMIT,
}: EventTimelineProps) {
  const reduce = useReducedMotion();
  const d = DENSITY[density];
  // Explicit open/closed overrides per band (serial mode + collapsibleGroups).
  // Default openness is "first (latest-activity) band open, the rest collapsed";
  // a click writes an override here.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center px-4 text-center text-role-caption font-medium text-text-faint">
        {emptyMessage}
      </div>
    );
  }

  // Serial-based view: render one EventTimeline band per identifier, reusing the
  // exact same row rendering (time grouping off inside a band). This keeps a
  // single timeline primitive — the serial view is the time view, re-bucketed.
  if (groupMode === 'serial') {
    const groups = groupBySerial(items, groupKeyOf);
    const isOpen = (key: string, idx: number): boolean =>
      !collapsibleGroups || (groupOverrides[key] ?? idx === 0);
    const toggle = (key: string, idx: number) =>
      setGroupOverrides((prev) => ({ ...prev, [key]: !(prev[key] ?? idx === 0) }));

    return (
      <div className={collapsibleGroups ? 'space-y-1.5' : 'space-y-5'}>
        {groups.map((g, gi) => {
          const open = isOpen(g.key, gi);
          const header = renderGroupHeader ? (
            renderGroupHeader(g)
          ) : (
            <DefaultGroupHeader group={g} />
          );
          const body = (
            <EventTimeline
              items={g.items}
              groupByDay={false}
              highlightLatest={false}
              density={density}
              groupMode="time"
              richTime={richTime}
              metaTrail={metaTrail}
              refInline={refInline}
              galleryPhotos={galleryPhotos}
              galleryMatchIds={galleryMatchIds}
              mediaThumbLimit={mediaThumbLimit}
              onSelectItem={onSelectItem}
            />
          );

          // Non-collapsible: today's behavior — header label above the rows.
          if (!collapsibleGroups) {
            return (
              <div key={g.key}>
                <div className="mb-2 flex items-center gap-2 pl-px">{header}</div>
                {body}
              </div>
            );
          }

          // Collapsible: a chevron header row; the latest band opens by default, the rest collapse to a one-line "latest event" peek.
          return (
            <div key={g.key} className="rounded-mode-control">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(g.key, gi)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(g.key, gi);
                  }
                }}
                aria-expanded={open}
                className={cn("group flex w-full cursor-pointer items-center gap-2 rounded-mode-control px-1.5 py-1 text-left transition-colors hover:bg-surface-hover", focusRing('control', 'accent'))}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-text-faint transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
                />
                <div className="min-w-0 flex-1">{header}</div>
                {!open ? <GroupLatestPeek items={g.items} richTime={richTime} /> : null}
              </div>
              {open ? <div className={/* ds-allow-spacing — aligns to the 18px rail column */ "mt-1.5 pl-[18px]"}>{body}</div> : null}
            </div>
          );
        })}
      </div>
    );
  }

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.035, delayChildren: 0.02 } },
  };
  const row: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, y: 3 },
        show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: motionBezier.easeOut } },
      };

  return (
    <motion.ol
      className="relative"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* StepRail hairline (same system as the Fulfilment ladder), soft at both
          ends so it never hard-stops past the first/last node. */}
      <span
        aria-hidden
        className={cn(STEP_RAIL_LINE_CLASS, STEP_RAIL_LINE_LEFT.md, 'top-1 bottom-1')}
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 14px), transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 14px), transparent)',
        }}
      />

      {items.map((item, i) => {
        const time = richTime ? relTime(item.at) : clockLabel(item.at);
        const dateKey = toPSTDateKey(item.at);
        const showDay = groupByDay && (i === 0 || dateKey !== toPSTDateKey(items[i - 1]?.at));
        const isLatest = highlightLatest && i === 0;
        // Station floor: title alone is primary; chip · time · actor is secondary.
        const stationAnatomy = metaTrail && refInline;
        const glyphSpec = resolveTimelineGlyph(item.sourceEventType);
        const GlyphIcon = TIMELINE_GLYPH_ICONS[glyphSpec.id];
        const identityRefs = itemIdentityRefs(item);
        /** The second line is EARNED BY THE CHIPS, not spent by default. */
        const stationTwoLine = stationAnatomy && identityRefs.length > 0;
        const glyphHref =
          item.href?.trim() || identityRefs[0]?.href?.trim() || undefined;
        const timeNode = richTime ? (
          <HoverTooltip
            label={absTimestamp(item.at)}
            focusable={false}
            className="cursor-default border-b border-dotted border-border-default"
          >
            {time}
          </HoverTooltip>
        ) : (
          time
        );
        const metaBits = (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-role-micro font-medium tabular-nums text-text-faint">
            {stationAnatomy && identityRefs.length > 0 ? (
              <span className="-my-0.5 inline-flex shrink-0 flex-wrap items-center gap-1">
                {identityRefs.map((r, ri) => (
                  <TimelineRefChip key={`${r.kind}:${r.value}:${ri}`} refItem={r} />
                ))}
              </span>
            ) : null}
            <span className="shrink-0 whitespace-nowrap">
              {timeNode}
              {item.actor ? <span className="text-text-faint"> · </span> : null}
              {item.actor ? <ActorLabel item={item} /> : null}
            </span>
          </span>
        );
        // Station omits raw PREV → NEXT machine trails (duplicate the title dialect).
        // Never repeat the CopyChip id as plain subtitle text.
        const rawFootnote =
          item.subtitle && !(stationAnatomy && isRawStatusTrailSubtitle(item.subtitle))
            ? item.subtitle
            : null;
        const footnote = rawFootnote
          ? isRedundantRefSubtitle(rawFootnote, identityRefs[0])
            ? collapseOnlyFootnote(rawFootnote, identityRefs[0])
            : rawFootnote
          : null;

        return (
          <motion.li key={item.id} variants={row} className="relative pl-5">
            {showDay ? (
              <div
                className={
                  stationAnatomy
                    ? `${d.day} mode-label mb-1 pl-px text-text-faint`
                    : `${d.day} mode-label mb-1.5 pl-px text-text-faint`
                }
              >
                {formatDateKeyMedium(dateKey) || '—'}
              </div>
            ) : null}

            <div className={`relative ${d.pb} last:pb-0`}>
              {/* StepRail node (md) centred on the hairline — latest filled, older quiet; link when href resolves. */}
              <span
                className={cn(
                  STEP_RAIL_NODE_CLASS,
                  STEP_RAIL_NODE_SIZE.md,
                  isLatest && !stationAnatomy ? STEP_NODE_STATE_CLASS.done : QUIET_NODE_CLASS,
                  'absolute -left-5',
                  d.glyphTop,
                )}
              >
                {item.icon ? (
                  item.icon
                ) : (
                  <HoverTooltip
                    label={glyphHref ? `${glyphSpec.tooltip} — open` : glyphSpec.tooltip}
                    focusable={false}
                  >
                    {glyphHref ? (
                      <Link
                        href={glyphHref}
                        className="flex size-4 items-center justify-center rounded-mode-pill transition-opacity hover:opacity-70"
                        aria-label={`${glyphSpec.tooltip} — open`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GlyphIcon className="shrink-0" aria-hidden />
                      </Link>
                    ) : (
                      <span className="flex size-4 items-center justify-center">
                        <GlyphIcon className="shrink-0" aria-hidden />
                      </span>
                    )}
                  </HoverTooltip>
                )}
              </span>

              {/* Hover surface — bleeds slightly past the text, never under the glyph. */}
              <div
                className={`-mx-2 rounded-mode-control px-2 py-0.5 transition-colors duration-150 hover:bg-surface-canvas/80${
                  onSelectItem ? ' cursor-pointer' : ''
                }`}
                role={onSelectItem ? 'button' : undefined}
                tabIndex={onSelectItem ? 0 : undefined}
                onClick={
                  onSelectItem
                    ? (e) => {
                        // Let inner chips/links keep their own click (copy / navigate).
                        if ((e.target as HTMLElement).closest('button,a')) return;
                        onSelectItem(item);
                      }
                    : undefined
                }
                onKeyDown={
                  onSelectItem
                    ? (e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        if ((e.target as HTMLElement).closest('button,a')) return;
                        e.preventDefault();
                        onSelectItem(item);
                      }
                    : undefined
                }
              >
                {stationTwoLine ? (
                  <>
                    <div
                      className={`text-role-caption tracking-tight ${
                        isLatest ? 'font-semibold text-text-default' : 'font-semibold text-text-muted'
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="mt-0.5">{metaBits}</div>
                  </>
                ) : metaTrail ? (
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={`text-role-caption tracking-tight ${
                        isLatest ? 'font-semibold text-text-default' : 'font-semibold text-text-muted'
                      }`}
                    >
                      {item.title}
                    </span>
                    {refInline && identityRefs.length > 0 ? (
                      <span className="-my-0.5 inline-flex shrink-0 flex-wrap items-center gap-1">
                        {identityRefs.map((r, ri) => (
                          <TimelineRefChip key={`${r.kind}:${r.value}:${ri}`} refItem={r} />
                        ))}
                      </span>
                    ) : null}
                    <span className="shrink-0 whitespace-nowrap text-role-micro font-medium tabular-nums text-text-faint">
                      {timeNode}
                      {item.actor ? <span className="text-text-faint"> · </span> : null}
                      {item.actor ? <ActorLabel item={item} /> : null}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Default anatomy: the human sentence, then who · when on its own line. */}
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        className={`text-role-caption tracking-tight ${
                          isLatest ? 'font-semibold text-text-default' : 'font-semibold text-text-muted'
                        }`}
                      >
                        {item.title}
                      </span>
                      {refInline && identityRefs.length > 0 ? (
                        <span className="-my-0.5 inline-flex shrink-0 flex-wrap items-center gap-1">
                          {identityRefs.map((r, ri) => (
                            <TimelineRefChip key={`${r.kind}:${r.value}:${ri}`} refItem={r} />
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-role-micro font-medium tabular-nums text-text-faint"
                      data-timeline-meta
                    >
                      {item.actor ? (
                        <>
                          <ActorLabel item={item} />
                          <span aria-hidden>·</span>
                        </>
                      ) : null}
                      <span className="whitespace-nowrap">{timeNode}</span>
                    </div>
                  </>
                )}

                {footnote ? (
                  <div className="mt-0.5 text-role-micro font-medium text-text-faint">{footnote}</div>
                ) : null}

                {item.changes?.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {item.changes.map((c, ci) => (
                      <li key={ci} className="text-role-micro font-medium text-text-faint">
                        <span className="font-semibold text-text-soft">{c.key}</span>
                        {': '}
                        <span className="text-text-faint">{c.before ?? '—'}</span>
                        <span className="text-text-faint"> → </span>
                        <span className="text-text-muted">{c.after ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!stationAnatomy && !refInline && identityRefs.length > 0 ? (
                  <div className="mt-1 -ml-1.5 inline-flex flex-wrap items-center gap-1">
                    {identityRefs.map((r, ri) => (
                      <TimelineRefChip key={`${r.kind}:${r.value}:${ri}`} refItem={r} />
                    ))}
                  </div>
                ) : null}

                {item.badges?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.badges.map((badge, bi) => (
                      <span
                        key={bi}
                        className={`inline-flex items-center rounded-mode-control px-1.5 py-0.5 text-role-eyebrow ${BADGE_TONE[badge.tone]}`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {item.media?.length ? (
                  <TimelineMediaStrip
                    media={item.media}
                    thumbLimit={mediaThumbLimit}
                    galleryPhotos={galleryPhotos}
                    galleryMatchIds={galleryMatchIds}
                  />
                ) : null}
              </div>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
