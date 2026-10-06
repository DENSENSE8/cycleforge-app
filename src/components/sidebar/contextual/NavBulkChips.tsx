'use client';

import { Fragment, type ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown } from '@/components/Icons';
import { motion } from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import type { LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
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

/** One status chip's facts — what the wrapping row and the page's fitting row (`PastedListStatusRow`) both paint. */
export interface StatusChipItem {
  key: string;
  /** The gliding pill's group (`PillChip.pill`). */
  pill: string;
  label: string;
  /** The section word painted before the chip — the first of its run when two sections share a status word. */
  heading?: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  /** The tone glyph before the word. */
  lead?: ReactNode;
}

/** A {@link StatusChipItem} as its chip. */
export function StatusChip({ item }: { item: StatusChipItem }) {
  return (
    <PillChip pill={item.pill} active={item.active} onClick={item.onSelect} label={item.label} count={item.count} lead={item.lead} />
  );
}

/**
 * Where the pasted numbers live: All N · each bucket that holds one (glyph in
 * its tone, its BARE status word, count) · Not found N. One word per status —
 * "Received", never "Receiving · Received" (owner 2026-10-04): the bucket id
 * carries the section (`inbound:received`), the chip does not. Only when two
 * sections hold a status of the same word does each section's run get one
 * quiet heading, so the two "Exceptions" can be told apart. A press writes
 * the list's status filter (`LocatedRecords.setStatus`; Not found is
 * {@link NAV_LOCATE_NOWHERE}). A bucket with nothing in it is hidden unless
 * it is the pressed one.
 */
export function bulkStatusItems(list: LocatedRecords, nowhere: number): StatusChipItem[] {
  if (list.buckets.length === 0 && nowhere === 0) return [];
  const shown = list.buckets.filter((bucket) => bucket.count > 0 || bucket.id === list.status);
  const words = shown.map((bucket) => bucket.label.toLowerCase());
  const clash = words.some((word, index) => words.indexOf(word) !== index);
  const items: StatusChipItem[] = [
    { key: 'all', pill: 'bucket', label: 'All', count: list.entries.length, active: list.status === null, onSelect: () => list.setStatus(null) },
  ];
  for (const run of clash ? sectionRuns(shown, list.scope) : [{ label: undefined, buckets: shown }]) {
    run.buckets.forEach((bucket, index) => {
      const Glyph = TONE_ICON[bucket.tone];
      items.push({
        key: bucket.id,
        pill: 'bucket',
        label: bucket.label,
        heading: index === 0 ? run.label : undefined,
        count: bucket.count,
        active: list.status === bucket.id,
        onSelect: () => list.setStatus(list.status === bucket.id ? null : bucket.id),
        lead: (
          <span aria-hidden className="inline-flex" style={{ color: NAV_LOCATE_TONE_VAR[bucket.tone] }}>
            <Glyph className="size-3" />
          </span>
        ),
      });
    });
  }
  if (nowhere > 0 || list.status === NAV_LOCATE_NOWHERE) {
    items.push({
      key: NAV_LOCATE_NOWHERE,
      pill: 'bucket',
      label: 'Not found',
      count: nowhere,
      active: list.status === NAV_LOCATE_NOWHERE,
      onSelect: () => list.setStatus(list.status === NAV_LOCATE_NOWHERE ? null : NAV_LOCATE_NOWHERE),
      lead: (
        <span aria-hidden className="inline-flex" style={{ color: NAV_LOCATE_TONE_VAR.danger }}>
          <AlertCircle className="size-3" />
        </span>
      ),
    });
  }
  return items;
}

/** The status chips, wrapping — the bar's small panel. The page body paints them on one fitting line (`PastedListStatusRow`). */
export function BulkStatusChips({ list, nowhere, className }: { list: LocatedRecords; nowhere: number; className?: string }) {
  const items = bulkStatusItems(list, nowhere);
  if (items.length === 0) return null;
  return (
    <div data-bulk-buckets className={cn('flex shrink-0 flex-wrap items-center gap-1', className)}>
      {items.map((item) => (
        <Fragment key={item.key}>
          {item.heading ? <StatusChipHeading>{item.heading}</StatusChipHeading> : null}
          <StatusChip item={item} />
        </Fragment>
      ))}
    </div>
  );
}

/** A section's quiet word before its run of chips. */
export function StatusChipHeading({ children }: { children: ReactNode }) {
  return <span className="px-0.5 text-role-micro text-text-faint">{children}</span>;
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
