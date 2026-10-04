'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from '@/components/Icons';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { projectMobileV2ScanRecents, type MobileV2ScanRecent } from '@/lib/mobile/v2-scan-recent';
import { cn } from '@/utils/_cn';
import type { StationItemAction, StationTapeEntry, StationTone } from '@/lib/mobile/station-tape';
import { MobileV2ScanRecentSheet } from './MobileV2ScanRecentSheet';

const CLOCK_TICK_MS = 30_000;
const TONE_STATE: Record<StationTone, StateName> = { ok: 'success', warn: 'warning', bad: 'danger' };

function RecentRow({
  entry,
  row,
  now,
  untitledLabel,
  actions,
  onOpen,
}: {
  entry: StationTapeEntry;
  row: MobileV2ScanRecent;
  now: number;
  untitledLabel: string;
  actions: readonly StationItemAction[];
  onOpen: (() => void) | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const tone = STATE_TONE_CLASSES[TONE_STATE[row.tone]];

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
        data-testid="mobile-v2-scan-recent-row"
        data-latest={row.isLatest || undefined}
        className={cn(
          'grid min-h-16 w-full grid-cols-[3px_3rem_minmax(0,1fr)_auto] items-stretch border-b border-border-soft bg-surface-card text-left transition-colors active:bg-surface-sunken',
          row.isLatest && 'bg-surface-accent/40',
        )}
      >
        <span aria-hidden className={tone.dot} />
        <span className="relative m-2 mr-0 overflow-hidden rounded-lg bg-surface-sunken">
          {row.imageUrl ? <ItemRecordThumb imageUrl={row.imageUrl} className="h-full w-full min-h-0" /> : null}
        </span>
        <span className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
          <span className="truncate text-sm font-semibold text-text-default">{row.title}</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
            {row.identifier ? <span className="truncate font-mono">{row.identifier}</span> : null}
            <time className="shrink-0" dateTime={row.occurredAt}>{formatRelativeTime(row.occurredAt, now)}</time>
          </span>
        </span>
        <span className="flex items-center gap-1 pr-2">
          <span className={cn('max-w-24 truncate text-xs font-semibold', tone.text)}>{row.outcome}</span>
          <ChevronRight aria-hidden className="h-4 w-4 text-text-faint" />
        </span>
      </button>
      {sheetOpen ? (
        <MobileV2ScanRecentSheet
          entry={entry}
          now={now}
          untitledLabel={untitledLabel}
          actions={actions}
          onOpen={onOpen}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

export function MobileV2ScanRecentList({
  entries,
  untitledLabel,
  itemActions,
  itemOpen,
  empty,
}: {
  entries: readonly StationTapeEntry[];
  untitledLabel: string;
  itemActions?: (entry: StationTapeEntry) => readonly StationItemAction[] | null;
  itemOpen?: (entry: StationTapeEntry) => (() => void) | null;
  empty?: React.ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const projected = useMemo(() => projectMobileV2ScanRecents(entries, untitledLabel), [entries, untitledLabel]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  if (entries.length === 0) return <div className="flex min-h-0 flex-1 items-end justify-center">{empty}</div>;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-canvas" aria-label="Recent scans">
      <div className="flex h-9 items-center justify-between border-b border-border-soft bg-surface-sunken px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Recent</h2>
        <span className="text-xs tabular-nums text-text-soft">{projected.length}</span>
      </div>
      <div role="list">
        {projected.map((row, index) => (
          <div role="listitem" key={row.id}>
            <RecentRow
              entry={entries[index]}
              row={row}
              now={now}
              untitledLabel={untitledLabel}
              actions={itemActions?.(entries[index]) ?? []}
              onOpen={itemOpen?.(entries[index]) ?? null}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
