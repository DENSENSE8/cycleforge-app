'use client';

/**
 * A pasted list's STATUS row on a page body (operator 2026-10-04): left-aligned
 * directly above the list's header row, never in the contextual sidebar. All ·
 * each bucket that holds a number (bare status words, counts) · Not found —
 * the list's own status chips (`bulkStatusItems`) over the same `useBulkList`
 * query the list reads — and, with `facetParam`, the pressed bucket's reasons
 * beside it (`?recon_reason=` on Incoming). A press writes the list's status
 * param; the pressed chip is one gliding pill. The bar's small panel keeps its
 * own wrapping chips + sort (`NavBulkPanel`).
 *
 * ONE line, never wrapping, never overflowing (operator 2026-10-05): a bucket
 * with nothing in it is hidden unless pressed, and the chips that still do not
 * fit fold into a trailing `More · N` menu. A hidden twin of every chip is
 * measured (ResizeObserver) to decide the fold; the pressed chip always stays
 * on the line.
 */

import { forwardRef, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { ChevronDown } from '@/components/Icons';
import { LayoutGroup } from '@/design-system/motion';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import type { LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import { cn } from '@/utils/_cn';
import { bulkStatusItems, StatusChip, StatusChipHeading, type StatusChipItem } from './NavBulkChips';
import { useReplaceSearchParams } from './useReplaceSearchParams';

/** The line's `gap-1`, px. */
const GAP_PX = 4;

export function PastedListStatusRow({
  list,
  facetParam = null,
  className,
}: {
  list: LocatedRecords;
  /** The reason param inside a pressed bucket (each entry's `facet`); null = no reasons. */
  facetParam?: string | null;
  className?: string;
}) {
  const pillScope = useId();
  const replace = useReplaceSearchParams();
  const nowhere = list.entries.filter((entry) => !entry.pending && entry.buckets.length === 0).length;
  const reasons: StatusChipItem[] = (facetParam ? bucketReasons(list) : []).map((reason) => ({
    key: `reason:${reason.id}`,
    pill: 'reason',
    label: reason.label,
    count: reason.count,
    active: list.facet === reason.id,
    onSelect: () =>
      replace((params) => {
        params.delete('page');
        if (list.facet === reason.id) params.delete(facetParam!);
        else params.set(facetParam!, reason.id);
      }),
  }));
  const items = [...bulkStatusItems(list, nowhere), ...reasons];
  const firstReason = reasons[0]?.key;

  const painted = list.entries.length > 0;
  // ── The fold: which chips go into More. Recomputed when the line or a chip's width changes. ──
  const fitRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState('');
  const signature = items.map((item) => `${item.key}${item.active ? '*' : ''}`).join('|');
  useLayoutEffect(() => {
    const fit = fitRef.current;
    const measure = measureRef.current;
    if (!fit || !measure) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      const style = window.getComputedStyle(fit);
      const available = fit.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const cells = [...measure.querySelectorAll<HTMLElement>('[data-fit-key]')].map((cell) => ({
        key: cell.dataset.fitKey ?? '',
        width: cell.offsetWidth,
        pinned: cell.dataset.fitPinned !== undefined,
      }));
      const more = measure.querySelector<HTMLElement>('[data-fit-more]')?.offsetWidth ?? 0;
      setFolded(foldedKeys(cells, available, more).join('|'));
    };
    run();
    // Batched to the next frame: the fold re-renders the line the observer watches.
    const observer = new ResizeObserver(() => {
      if (!frame) frame = window.requestAnimationFrame(run);
    });
    observer.observe(fit);
    observer.observe(measure);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [signature, painted]);
  const foldedSet = useMemo(() => new Set(folded.split('|')), [folded]);

  if (!painted) return null;
  const shown = items.filter((item) => !foldedSet.has(item.key));
  const hidden = items.filter((item) => foldedSet.has(item.key));
  const firstShownReason = shown.find((item) => item.pill === 'reason')?.key;

  return (
    <div
      data-pasted-list-status
      role="group"
      aria-label="Status"
      className={cn('relative flex min-w-0 items-center overflow-hidden', className)}
    >
      <LayoutGroup id={pillScope}>
        {/* p-0.5: the chips' focus rings stay inside the clip. */}
        <div ref={fitRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 p-0.5">
          {shown.map((item) => (
            <StatusCell key={item.key} item={item} separated={item.key === firstShownReason} />
          ))}
          {hidden.length > 0 ? <StatusMoreMenu items={hidden} /> : null}
        </div>
      </LayoutGroup>
      {/* The measuring twin: every chip at rest, plus the widest More face. `invisible` keeps it out of sight, focus and the a11y tree. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max flex-nowrap items-center gap-1"
      >
        {items.map((item) => (
          <StatusCell key={item.key} item={{ ...item, active: false }} pinned={item.active} separated={item.key === firstReason} />
        ))}
        <span data-fit-more className="inline-flex shrink-0">
          <MoreFace count={items.length} />
        </span>
      </div>
    </div>
  );
}

/** One chip on the line, with its section word and (the first reason) the hairline before it. */
function StatusCell({ item, separated, pinned }: { item: StatusChipItem; separated: boolean; pinned?: boolean }) {
  return (
    <span data-fit-key={item.key} data-fit-pinned={pinned || undefined} className="inline-flex shrink-0 items-center gap-1">
      {separated ? <span aria-hidden className="mr-0.5 h-4 w-px bg-border-hairline" /> : null}
      {item.heading ? <StatusChipHeading>{item.heading}</StatusChipHeading> : null}
      <StatusChip item={item} />
    </span>
  );
}

/** The chips that did not fit, in line order; a pick presses the chip. */
function StatusMoreMenu({ items }: { items: readonly StatusChipItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MoreFace count={items.length} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] min-w-40 overflow-y-auto">
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
            {item.lead}
            {item.heading ? `${item.heading} · ${item.label}` : item.label}
            <span className="ml-auto pl-3 tabular-nums text-text-muted">{item.count}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** `More · N ▾` on the chips' 24px face; the menu's trigger props and ref pass through to the button. */
const MoreFace = forwardRef<HTMLButtonElement, { count: number } & ComponentPropsWithoutRef<'button'>>(function MoreFace(
  { count, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      size="sm"
      variant="ghost"
      iconRight={<ChevronDown aria-hidden />}
      className="h-6 shrink-0 gap-1 px-1.5 text-role-micro font-semibold tabular-nums text-text-muted"
      {...rest}
    >
      More · {count}
    </Button>
  );
});

/**
 * Which chips fold into More: none when every chip fits; else the pinned
 * (pressed) chips stay, then the rest in line order while they fit beside the
 * More face — the first that does not fit folds with everything after it.
 */
function foldedKeys(cells: readonly { key: string; width: number; pinned: boolean }[], available: number, moreWidth: number): string[] {
  const all = cells.reduce((sum, cell) => sum + cell.width, 0) + GAP_PX * Math.max(0, cells.length - 1);
  if (all <= available) return [];
  const budget = available - moreWidth - GAP_PX;
  const kept = new Set<string>();
  let used = 0;
  for (const cell of cells) {
    if (!cell.pinned) continue;
    used += cell.width + (kept.size > 0 ? GAP_PX : 0);
    kept.add(cell.key);
  }
  for (const cell of cells) {
    if (cell.pinned) continue;
    const cost = cell.width + (kept.size > 0 ? GAP_PX : 0);
    if (used + cost > budget) break;
    used += cost;
    kept.add(cell.key);
  }
  return cells.filter((cell) => !kept.has(cell.key)).map((cell) => cell.key);
}

/** Why the pressed bucket's numbers sit there — each entry's `facet`, counted, in answer order. */
function bucketReasons(list: LocatedRecords): { id: string; label: string; count: number }[] {
  const status = list.status;
  if (!status) return [];
  const byId = new Map<string, { id: string; label: string; count: number }>();
  for (const entry of list.entries) {
    if (!entry.facet || !entry.buckets.includes(status)) continue;
    const seen = byId.get(entry.facet.id);
    if (seen) seen.count += 1;
    else byId.set(entry.facet.id, { id: entry.facet.id, label: entry.facet.label, count: 1 });
  }
  return [...byId.values()];
}
