'use client';

/**
 * The COLUMN BOARD display method (`column-board`, `src/lib/tables/display-method.ts`):
 * one column per group / status, ordered urgent → done, side by side in one
 * horizontal strip that snaps to column edges. Shift + wheel is the
 * platform's own horizontal scroll; the strip never listens to the wheel.
 * Each column is a header — label, exact count, optional action — over its
 * own vertically scrolling body (the header never scrolls away), which the
 * page fills with its own row face.
 *
 * Two layouts, one strip:
 * - `columns` (default): equal columns that fill the width, 340px floor — the Tasks board.
 * - `lanes`: a triage board. Lanes keep ONE fixed width (`lane`, 20rem) and the
 *   board runs off the page to the right: horizontal scroll (snap; Shift +
 *   wheel / trackpad) with an edge fade and scroll shadow on whichever end
 *   has more. `full` = the strip's whole width — an expanded lane, or one lane
 *   per phone screen. Lanes group under {@link ColumnBoardSection} eyebrows
 *   divided by a hairline and a 16px gap; an empty lane folds to a 56px
 *   {@link ColumnBoardRail}. A lane header carries two rows (count + meta)
 *   under a 3px tone bar, its actions revealed on hover / focus.
 *
 * Every control stays in the left contextual sidebar; a record opened from a
 * column opens in split so the board stays visible. Phone: one column at a
 * time is the list (`./ColumnBoardPhone`). Consumers: `TaskBoardColumns`
 * (columns), `LiveFeedBoard` (lanes).
 */

import { useCallback, useEffect, useState, type MutableRefObject, type ReactNode, type RefCallback } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

type ColumnBoardLayout = 'columns' | 'lanes';

const STRIP_CLASS: Record<ColumnBoardLayout, string> = {
  columns: 'flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden',
  // `@container/board`: a `full` lane measures the strip itself (100cqw).
  // `relative`: a lane's offsetLeft is measured from the strip (the phone pager scrolls to it).
  // Proximity snap from md up: unfolding a row must not re-snap the strip to another lane; a phone pages lane by lane.
  lanes:
    '@container/board relative flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden md:snap-proximity',
};

/** The house scroll shadow (TriageListBody's bottom edge), turned to face sideways. */
const EDGE_CLASS = 'pointer-events-none absolute inset-y-0 z-10 w-12 from-black/[0.11] via-black/[0.04] to-transparent transition-opacity duration-200';

export function ColumnBoard({
  testId,
  label,
  layout = 'columns',
  ref,
  children,
}: {
  testId: string;
  label?: string;
  layout?: ColumnBoardLayout;
  /** The scrolling strip — {@link useColumnBoardPager} reads it. */
  ref?: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const lanes = layout === 'lanes';

  const stripRef = useCallback<RefCallback<HTMLDivElement>>(
    (node) => {
      setStrip(node);
      if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    if (!lanes || !strip) return;
    const read = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      const start = strip.scrollLeft > 1;
      const end = strip.scrollLeft < max - 1;
      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    // The strip's own box and each section / lane in it: a lane revealed or widened moves the end edge.
    const resize = new ResizeObserver(read);
    const watch = () => {
      resize.disconnect();
      resize.observe(strip);
      for (const child of strip.children) resize.observe(child);
      read();
    };
    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(strip, { childList: true });
    strip.addEventListener('scroll', read, { passive: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
      strip.removeEventListener('scroll', read);
    };
  }, [lanes, strip]);

  const body = (
    <div ref={stripRef} data-testid={testId} aria-label={label} className={STRIP_CLASS[layout]}>
      {children}
    </div>
  );
  if (!lanes) return body;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {body}
      <span
        aria-hidden
        data-testid={`${testId}-edge-start`}
        data-visible={edges.start ? '' : undefined}
        className={cn(EDGE_CLASS, 'left-0 border-l border-border-hairline bg-gradient-to-r', edges.start ? 'opacity-100' : 'opacity-0')}
      />
      <span
        aria-hidden
        data-testid={`${testId}-edge-end`}
        data-visible={edges.end ? '' : undefined}
        className={cn(EDGE_CLASS, 'right-0 border-r border-border-hairline bg-gradient-to-l', edges.end ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}

/** A run of lanes under one eyebrow (`Work now`, `Done`). Sections after the first open with a hairline and a 16px gap. */
export function ColumnBoardSection({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      data-section={id}
      className="flex min-h-0 shrink-0 flex-col border-l border-border-hairline pl-4 first:border-l-0 first:pl-0"
    >
      <div className="flex h-8 shrink-0 items-center">
        <span className="sticky left-0 text-role-eyebrow text-text-muted">{label}</span>
      </div>
      <div className="flex min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** A `lanes` column's width: the one fixed lane width, or the strip's whole width. */
export type ColumnBoardWidth = 'lane' | 'full';

const WIDTH_CLASS: Record<ColumnBoardWidth | 'standard', string> = {
  standard: 'min-w-[340px] flex-1 basis-0',
  // Inline-size containment: long, truncated rows never widen a lane.
  lane: 'w-80 shrink-0 contain-inline-size',
  full: 'w-[100cqw] shrink-0 contain-inline-size',
};

export interface ColumnBoardColumnProps {
  /** Stable column id — `data-column`. */
  id: string;
  label: string;
  /** The column's exact count (the header never paints a page's length as the total). */
  count: number;
  /** Word after the count (`3 open`); omitted = the bare number. */
  countLabel?: string;
  /** Leading glyph, already sized and inked by the page. */
  icon?: ReactNode;
  /** Header action at the right edge. On a lane header (`meta` set) it shows on header hover / focus only. */
  action?: ReactNode;
  /** `lanes` boards: the width policy. Omitted = the `columns` layout's equal 340px-floor column. */
  width?: ColumnBoardWidth;
  /**
   * The LANE header's second row (late · oldest, top groups). Set = the
   * two-row 64px lane header: label (one line) · count at display size,
   * then this muted caption.
   */
  meta?: ReactNode;
  /** The long definition — the label's hover tooltip. */
  hint?: string;
  /** Background class of the lane header's 3px tone bar (`bg-fill-warning`). */
  accent?: string;
  testId: string;
  /** Extra attributes for the column root (a page's own cursor marks). */
  rootAttrs?: Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}

export function ColumnBoardColumn({
  id,
  label,
  count,
  countLabel,
  icon,
  action,
  width,
  meta,
  hint,
  accent,
  testId,
  rootAttrs,
  children,
}: ColumnBoardColumnProps) {
  const lane = meta !== undefined;
  return (
    <section
      aria-label={label}
      data-testid={testId}
      data-column={id}
      data-width={width}
      {...rootAttrs}
      className={cn(
        'flex min-h-0 snap-start flex-col border-r border-border-hairline last:border-r-0',
        WIDTH_CLASS[width ?? 'standard'],
      )}
    >
      {lane ? (
        <header className="group/lane-head relative flex h-16 shrink-0 flex-col justify-center gap-0.5 px-3">
          <span aria-hidden className={cn('absolute inset-x-0 top-0 h-0.75', accent ?? 'bg-mode-edge')} />
          <div className="flex min-w-0 items-center gap-2">
            {icon}
            <h2 className="whitespace-nowrap text-role-body font-semibold text-text-default">
              {hint ? <HoverTooltip label={hint} openDelayMs={400}>{label}</HoverTooltip> : label}
            </h2>
            {action ? (
              <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/lane-head:opacity-100 has-[[data-state=open]]:opacity-100">
                {action}
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-role-display tabular-nums text-text-default" data-testid={`${testId}-count`}>
              {countLabel ? `${count} ${countLabel}` : count}
            </span>
          </div>
          <p className="truncate text-role-caption tabular-nums text-text-muted" data-testid={`${testId}-meta`}>
            {meta}
          </p>
        </header>
      ) : (
        <header className="flex h-9 shrink-0 items-center gap-1.5 px-4">
          {icon}
          <h2 className="text-xs font-semibold text-text-default">{label}</h2>
          <span className="shrink-0 text-role-micro tabular-nums text-text-muted" data-testid={`${testId}-count`}>
            {countLabel ? `${count} ${countLabel}` : count}
          </span>
          {action ? <span className="ml-auto flex shrink-0 items-center gap-1">{action}</span> : null}
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/**
 * An EMPTY column folded to a 56px rail: the tone bar, the count, the label
 * read top to bottom. Click / Enter unfolds it (the page decides for how long).
 */
export function ColumnBoardRail({
  id,
  label,
  count,
  accent,
  hint,
  onExpand,
  testId,
}: {
  id: string;
  label: string;
  count: number;
  accent?: string;
  hint?: string;
  onExpand: () => void;
  testId: string;
}) {
  return (
    <section
      aria-label={label}
      data-testid={testId}
      data-column={id}
      data-width="rail"
      className="flex min-h-0 w-14 shrink-0 snap-start flex-col border-r border-border-hairline last:border-r-0"
    >
      <HoverTooltip label={hint ? `${label} — ${hint}` : label} asChild openDelayMs={400}>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`${label}, ${count}. Show the column`}
          className={cn(
            'relative flex min-h-0 flex-1 flex-col items-center gap-3 pt-4 text-text-muted transition-colors hover:bg-mode-hover hover:text-text-default',
            focusRing('control'),
          )}
        >
          <span aria-hidden className={cn('absolute inset-x-0 top-0 h-0.75', accent ?? 'bg-mode-edge')} />
          <span className="text-role-data tabular-nums" data-testid={`${testId}-count`}>
            {count}
          </span>
          <span className="whitespace-nowrap text-role-caption [writing-mode:vertical-rl]">{label}</span>
        </button>
      </HoverTooltip>
    </section>
  );
}

/** A column with nothing in it. */
export function ColumnBoardEmpty({ children = 'Nothing here.' }: { children?: ReactNode }) {
  return <p className="px-4 py-6 text-xs text-text-muted">{children}</p>;
}
