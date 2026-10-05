'use client';

import { type ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown } from '@/components/Icons';
import { motion } from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import type { BulkList } from '@/lib/nav/locate/use-bulk-list';
import { NAV_LOCATE_NOWHERE, NAV_LOCATOR_SECTION_LABEL, type NavLocateBucket, type NavLocateScope } from '@/lib/nav/context/schema';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { BulkListSort } from './bulk-list-view';
import { NAV_LOCATE_TONE_VAR } from './nav-locate-tone';
import { TONE_ICON } from './NavBulkRow';

/**
 * A sort or status chip. Its pressed face is ONE pill per group (`pill`, a
 * `layoutId` — scope it with a `LayoutGroup` per surface) that glides from
 * the chip it leaves to the chip pressed (`motionTransition.findListGlide`,
 * ease-in-out); a count ticks with AnimatedStat.
 */
export function PillChip({
  pill,
  active,
  onClick,
  label,
  count,
  tooltip,
  shortcut,
  lead,
  trail,
}: {
  pill: string;
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tooltip?: string;
  /** The chip's key — taught in its hover tooltip, never painted on the chip. */
  shortcut?: string;
  lead?: ReactNode;
  trail?: ReactNode;
}) {
  const glide = useMotionTransition(motionTransition.findListGlide);
  return (
    <HoverTooltip label={tooltip ?? label} shortcut={shortcut} disabled={!shortcut} asChild>
      {/* ds-raw-button: the pressed face is a gliding layoutId pill child, which Button's fixed face cannot host. */}
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'ds-raw-button relative isolate inline-flex h-6 shrink-0 items-center gap-1 px-1.5 text-role-micro font-semibold tabular-nums',
          'transition-[color,transform] duration-100 active:translate-y-px',
          active ? 'text-text-default' : 'text-text-muted hover:text-text-default',
          SIDEBAR_CHIP_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        {active ? (
          <motion.span
            aria-hidden
            layoutId={pill}
            transition={glide}
            className={cn('absolute inset-0 -z-10 bg-surface-card shadow-sm ring-1 ring-border-soft', SIDEBAR_CHIP_CORNER)}
          />
        ) : null}
        {lead}
        {label}
        {count !== undefined ? <AnimatedStat value={count} /> : null}
        {trail}
      </button>
    </HoverTooltip>
  );
}

/**
 * Where the pasted numbers live: All N · each bucket that holds one (glyph in
 * its tone, its BARE status word, count) · Not found N. One word per status —
 * "Received", never "Receiving · Received" (owner 2026-10-04): the bucket id
 * carries the section (`inbound:received`), the chip does not. Only when two
 * sections hold a status of the same word does each section's run get one
 * quiet heading, so the two "Exceptions" can be told apart. A press writes
 * the list's status filter (`BulkList.setStatus`; Not found is
 * {@link NAV_LOCATE_NOWHERE}); the pressed chip is one gliding pill. The bar's
 * panel, the ⌘K palette's list and the full list page paint this same row.
 */
export function BulkStatusChips({ list, nowhere, className }: { list: BulkList; nowhere: number; className?: string }) {
  if (list.buckets.length === 0 && nowhere === 0) return null;
  const shown = list.buckets.filter((bucket) => bucket.count > 0 || bucket.id === list.status);
  const runs = sectionRuns(shown, list.scope);
  const words = shown.map((bucket) => bucket.label.toLowerCase());
  const clash = words.some((word, index) => words.indexOf(word) !== index);
  const chip = (bucket: NavLocateBucket) => {
    const Glyph = TONE_ICON[bucket.tone];
    return (
      <PillChip
        key={bucket.id}
        pill="bucket"
        active={list.status === bucket.id}
        onClick={() => list.setStatus(list.status === bucket.id ? null : bucket.id)}
        label={bucket.label}
        count={bucket.count}
        lead={
          <span aria-hidden className="inline-flex" style={{ color: NAV_LOCATE_TONE_VAR[bucket.tone] }}>
            <Glyph className="size-3" />
          </span>
        }
      />
    );
  };
  return (
    <div data-bulk-buckets className={cn('flex shrink-0 flex-wrap items-center gap-1', className)}>
      <PillChip pill="bucket" active={list.status === null} onClick={() => list.setStatus(null)} label="All" count={list.entries.length} />
      {clash
        ? runs.map((run) => (
            <span key={run.section} data-bulk-section={run.section} className="flex flex-wrap items-center gap-1">
              <span className="px-0.5 text-role-micro text-text-faint">{run.label}</span>
              {run.buckets.map(chip)}
            </span>
          ))
        : shown.map(chip)}
      {nowhere > 0 || list.status === NAV_LOCATE_NOWHERE ? (
        <PillChip
          pill="bucket"
          active={list.status === NAV_LOCATE_NOWHERE}
          onClick={() => list.setStatus(list.status === NAV_LOCATE_NOWHERE ? null : NAV_LOCATE_NOWHERE)}
          label="Not found"
          count={nowhere}
          lead={
            <span aria-hidden className="inline-flex" style={{ color: NAV_LOCATE_TONE_VAR.danger }}>
              <AlertCircle className="size-3" />
            </span>
          }
        />
      ) : null}
    </div>
  );
}

/** Buckets grouped by the section that holds them, in answer order — the page's own first. */
function sectionRuns(buckets: readonly NavLocateBucket[], scope: NavLocateScope) {
  const runs: { section: string; label: string; buckets: NavLocateBucket[] }[] = [];
  for (const bucket of buckets) {
    const at = bucket.id.indexOf(':');
    const section = (at > 0 ? bucket.id.slice(0, at) : scope) as NavLocateScope;
    let run = runs.find((r) => r.section === section);
    if (!run) {
      run = { section, label: section === 'everywhere' ? '' : NAV_LOCATOR_SECTION_LABEL[section], buckets: [] };
      runs.push(run);
    }
    run.buckets.push(bucket);
  }
  return runs;
}

/**
 * Pasted · Order ID ↑↓ [O] · Status [S] — the list's one sort, shared by the
 * bar and the page. `idKey={false}` where O means something else (the full
 * list page opens the record on O).
 */
export function BulkSortChips({
  sort,
  onSort,
  idKey = true,
}: {
  sort: BulkListSort;
  onSort: (next: BulkListSort) => void;
  idKey?: boolean;
}) {
  const OrderIcon = sort.by !== 'id' ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <>
      <PillChip
        pill="sort"
        active={sort.by === 'pasted'}
        onClick={() => onSort({ by: 'pasted', dir: 'asc' })}
        label="Pasted"
        tooltip="Sort as pasted"
      />
      <PillChip
        pill="sort"
        active={sort.by === 'id'}
        onClick={() => onSort(nextIdSort(sort))}
        label="Order ID"
        tooltip="Sort by order ID"
        shortcut={idKey ? 'O' : undefined}
        trail={<OrderIcon aria-hidden className="size-3" />}
      />
      <PillChip
        pill="sort"
        active={sort.by === 'status'}
        onClick={() => onSort(nextStatusSort(sort))}
        label="Status"
        tooltip="Sort by status"
        shortcut="S"
      />
    </>
  );
}

/** Order ID cycles ascending → descending → as pasted. */
export function nextIdSort(sort: BulkListSort): BulkListSort {
  if (sort.by !== 'id') return { by: 'id', dir: 'asc' };
  return sort.dir === 'asc' ? { by: 'id', dir: 'desc' } : { by: 'pasted', dir: 'asc' };
}

/** Status toggles with as pasted. */
export function nextStatusSort(sort: BulkListSort): BulkListSort {
  return sort.by === 'status' ? { by: 'pasted', dir: 'asc' } : { by: 'status', dir: 'asc' };
}
