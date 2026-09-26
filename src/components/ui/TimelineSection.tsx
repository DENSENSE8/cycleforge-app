'use client';

import type { ReactNode } from 'react';
import { EventTimeline, type TimelineGroupMode, type TimelineGroupView } from './EventTimeline';
import type { TimelineItem, TimelineGroupKey } from '@/lib/timeline/types';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { sectionLabel, microBadge } from '@/design-system/tokens/typography/presets';

/** The drop-in activity-timeline block for any detail panel: */
export interface TimelineSectionProps {
  items: TimelineItem[];
  title?: string;
  /** Optional right-aligned slot in the header (a count, a filter, …). */
  headerRight?: ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  density?: 'comfortable' | 'compact';
  /** Identifier grouping (serial↔order toggle), forwarded to {@link EventTimeline}. */
  groupMode?: TimelineGroupMode;
  /** Override band bucketing in serial mode, forwarded to {@link EventTimeline}. */
  groupKeyOf?: (item: TimelineItem) => TimelineGroupKey | null;
  /** Rich (relative + hover-absolute) timestamps, forwarded to {@link EventTimeline}. */
  richTime?: boolean;
  /**
   * Station floor: with {@link refInline}, enables two-line anatomy (title
   * primary; chip · time · actor secondary). Alone: single-line meta trail.
   */
  metaTrail?: boolean;
  /**
   * Station floor: with {@link metaTrail}, SerialChip / id chip on the secondary
   * meta line. Forwarded to {@link EventTimeline}.
   */
  refInline?: boolean;
  /** Serial mode: collapse each band behind a chevron, forwarded to {@link EventTimeline}. */
  collapsibleGroups?: boolean;
  /** Serial mode: custom band header, forwarded to {@link EventTimeline}. */
  renderGroupHeader?: (group: TimelineGroupView) => ReactNode;
  /** Opt-in row activation (Monitor→detail drill), forwarded to {@link EventTimeline}. */
  onSelectItem?: (item: TimelineItem) => void;
  /** Lightbox override for media strips, forwarded to {@link EventTimeline}. */
  galleryPhotos?: PhotoGalleryInput[];
  /** Parallel ids for URL-only {@link galleryPhotos}, forwarded to {@link EventTimeline}. */
  galleryMatchIds?: Array<number | null | undefined>;
  /** Max preview thumbs before `+N`, forwarded to {@link EventTimeline}. */
  mediaThumbLimit?: number;
  /** Outer wrapper classes — spacing/divider live with the caller. */
  className?: string;
}

function TimelineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ol className="relative animate-pulse" aria-hidden>
      <span className="absolute left-2 top-1 bottom-1 w-px bg-surface-sunken" />
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="relative pl-5 pb-4 last:pb-0">
          <span className="absolute -left-5 top-0 flex h-4 w-4 items-center justify-center bg-surface-card">
            <span className="h-3.5 w-3.5 rounded-sm bg-surface-strong" />
          </span>
          <div className="flex items-baseline justify-between gap-3">
            <span className="h-2.5 rounded bg-surface-strong" style={{ width: `${52 - i * 8}%` }} />
            <span className="h-2 w-12 rounded bg-surface-sunken" />
          </div>
          <span className="mt-1.5 block h-2 w-16 rounded bg-surface-sunken" />
        </li>
      ))}
    </ol>
  );
}

export function TimelineSection({
  items,
  title = 'Activity',
  headerRight,
  loading = false,
  emptyMessage = 'No activity recorded yet.',
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
  mediaThumbLimit,
  className = 'mx-8 mt-2 border-t border-border-hairline pt-4 pb-8',
}: TimelineSectionProps) {
  return (
    <section className={className}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className={sectionLabel}>{title}</h3>
        {headerRight ? <div className={`${microBadge} font-medium text-text-faint`}>{headerRight}</div> : null}
      </header>
      {loading ? (
        <TimelineSkeleton />
      ) : (
        <EventTimeline
          items={items}
          emptyMessage={emptyMessage}
          density={density}
          groupMode={groupMode}
          groupKeyOf={groupKeyOf}
          richTime={richTime}
          metaTrail={metaTrail}
          refInline={refInline}
          collapsibleGroups={collapsibleGroups}
          renderGroupHeader={renderGroupHeader}
          onSelectItem={onSelectItem}
          galleryPhotos={galleryPhotos}
          galleryMatchIds={galleryMatchIds}
          mediaThumbLimit={mediaThumbLimit}
        />
      )}
    </section>
  );
}
