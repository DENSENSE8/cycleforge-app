'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { Button } from '@/design-system/primitives';
import { Panel } from '@/design-system/primitives/Panel';
import { GridDegradedBox } from '@/design-system/components/grid';
import { useStationLiveFeed } from '@/hooks/useStationLiveFeed';
import { stationHistoryActionLabel, stationHistoryTaskKey } from '@/lib/station-feed/action-label';
import type { StationFeedFilters, StationFeedItem, StationFeedJob } from '@/lib/station-feed/types';
import type { TimelineItem } from '@/lib/timeline/types';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';

const JOB_LABEL: Record<StationFeedJob, string> = {
  identify: 'Identify',
  arrival: 'Arrival',
  unbox: 'Unbox',
  pick: 'Pick',
  quality_control: 'Quality Control',
  pack: 'Pack',
  scan_out: 'Scan out',
};

interface HistoryTask {
  key: string;
  job: StationFeedJob;
  items: StationFeedItem[];
}

function groupTasks(items: readonly StationFeedItem[]): HistoryTask[] {
  const tasks: HistoryTask[] = [];
  const index = new Map<string, HistoryTask>();
  for (const item of items) {
    const key = stationHistoryTaskKey(item);
    const existing = index.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const task = { key, job: item.job, items: [item] };
    index.set(key, task);
    tasks.push(task);
  }
  return tasks;
}

function taskState(task: HistoryTask): 'Fulfilled' | 'Needs attention' | 'In progress' {
  if (task.items.some((item) => item.outcome === 'needs_attention')) return 'Needs attention';
  if (task.items.some((item) => item.outcome === 'committed' && (item.job === 'arrival' || item.job === 'scan_out' || item.job === 'unbox' || item.job === 'pack'))) {
    return 'Fulfilled';
  }
  if (task.items.every((item) => item.outcome === 'identified')) return 'In progress';
  return task.items.some((item) => item.outcome === 'committed') ? 'Fulfilled' : 'In progress';
}

function receiptSentence(task: HistoryTask): string {
  const latest = task.items[0];
  if (!latest) return 'No actions yet.';
  if (latest.job === 'arrival') {
    return `You scanned arrival for ${latest.subject.title}`;
  }
  if (latest.job === 'scan_out') {
    return latest.subject.identifier
      ? `You scanned out tracking ${latest.subject.identifier}`
      : `You scanned out ${latest.subject.title}`;
  }
  if (latest.job === 'identify') return `You identified ${latest.subject.identifier ?? latest.subject.title}`;
  return `You completed ${JOB_LABEL[latest.job]} for ${latest.subject.title}`;
}

function toTimelineItem(item: StationFeedItem): TimelineItem {
  const identifier = item.subject.identifier;
  return {
    id: item.id,
    at: item.occurredAt,
    title: stationHistoryActionLabel(item),
    tone: item.outcome === 'needs_attention' ? 'danger' : item.outcome === 'identified' ? 'info' : 'success',
    subtitle: item.subject.title,
    href: item.subject.href ?? undefined,
    ref: identifier
      ? {
          value: identifier,
          kind: item.job === 'arrival' || item.job === 'scan_out' ? 'tracking' : 'id',
          href: item.subject.href ?? undefined,
        }
      : undefined,
    sourceEventType: item.job === 'arrival' ? 'receiving.carton.arrived' : item.job === 'scan_out' ? 'SHIP_CONFIRM' : item.job,
    badges: item.outcome === 'needs_attention' ? [{ label: 'Needs attention', tone: 'danger' }] : undefined,
  };
}

function HistoryReceipt({ task }: { task: HistoryTask | null }) {
  const router = useRouter();
  if (!task) {
    return (
      <Panel radius="2xl" padding="sm" elevation="none" className="border border-border-soft bg-surface-card">
        <p className="text-sm text-text-muted">Scan on your phone. Arrival and scan-out land here.</p>
      </Panel>
    );
  }
  const state = taskState(task);
  const onMobile = task.items.every((item) => item.context.origin === 'phone');
  const href = task.items.find((item) => item.subject.href)?.subject.href ?? null;
  return (
    <Panel radius="2xl" padding="sm" elevation="none" className="border border-border-soft bg-surface-card">
      <p className={cn('text-xs font-semibold', state === 'Needs attention' ? STATE_TONE_CLASSES.danger.text : STATE_TONE_CLASSES.success.text)}>
        {state}
        {onMobile ? ' · Completed on mobile' : ''}
      </p>
      <p className="mt-1 text-sm font-semibold text-text-default">{receiptSentence(task)}</p>
      <p className="mt-1 text-xs text-text-muted">
        {task.items.length} {task.items.length === 1 ? 'action' : 'actions'} · {JOB_LABEL[task.job]}
      </p>
      {href ? (
        <Button
          variant="secondary"
          size="lg"
          radius="surface"
          className="mt-3 min-h-11 w-full md:w-auto"
          onClick={() => router.push(href)}
        >
          Open record
        </Button>
      ) : null}
    </Panel>
  );
}

export function StationLiveFeed({ filters }: { filters: StationFeedFilters }) {
  const feed = useStationLiveFeed(filters);
  const tasks = useMemo(() => groupTasks(feed.items), [feed.items]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const pinnedSelection = useRef(false);
  useEffect(() => {
    if (pinnedSelection.current || !tasks[0]) return;
    pinnedSelection.current = true;
    setSelectedKey(tasks[0].key);
  }, [tasks]);
  const selected = tasks.find((task) => task.key === selectedKey) ?? null;
  const delayed = feed.realtime.degraded || (feed.isError && feed.items.length > 0);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!primed.current) {
      for (const item of feed.items) seen.current.add(item.id);
      if (feed.items.length > 0 || !feed.isPending) primed.current = true;
      return;
    }
    const fresh = feed.items.filter((item) => !seen.current.has(item.id));
    for (const item of feed.items) seen.current.add(item.id);
    if (fresh.length === 1) setAnnouncement(`New activity. ${stationHistoryActionLabel(fresh[0]!)}`);
    else if (fresh.length > 1) setAnnouncement(`${fresh.length} new actions`);
  }, [feed.items, feed.isPending]);

  const timelineItems = useMemo(
    () => (selected ? selected.items.map(toTimelineItem) : feed.items.map(toTimelineItem)),
    [feed.items, selected],
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface-canvas" aria-labelledby="station-live-title">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <header className="flex shrink-0 items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <h1 id="station-live-title" className="text-sm font-semibold text-text-default">My history</h1>
          <p className="text-xs text-text-muted">
            {feed.items.length} recent {feed.items.length === 1 ? 'action' : 'actions'}
          </p>
        </div>
        <span className={cn('text-xs font-medium', delayed ? STATE_TONE_CLASSES.warning.text : STATE_TONE_CLASSES.success.text)}>
          {delayed ? 'Updating' : 'Live'}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {feed.isPending && feed.items.length === 0 ? (
          <p className="text-sm text-text-muted">Loading your history…</p>
        ) : feed.isError && feed.items.length === 0 ? (
          <GridDegradedBox message="Couldn't load your history." onRetry={() => { void feed.refetch(); }} />
        ) : (
          <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
            <div className="md:sticky md:top-3 md:order-2">
              <HistoryReceipt task={selected} />
              {tasks.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {tasks.slice(0, 8).map((task) => (
                    <Button
                      key={task.key}
                      variant={task.key === selected?.key ? 'secondary' : 'ghost'}
                      size="lg"
                      radius="surface"
                      className="min-h-11 shrink-0"
                      aria-pressed={task.key === selected?.key}
                      onClick={() => {
                        pinnedSelection.current = true;
                        setSelectedKey(task.key);
                      }}
                    >
                      {JOB_LABEL[task.job]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 md:order-1">
              {timelineItems.length === 0 ? (
                <p className="text-sm text-text-muted">No phone arrival or scan-out yet.</p>
              ) : (
                <EventTimeline
                  items={timelineItems}
                  density="compact"
                  richTime
                  metaTrail
                  refInline
                  highlightLatest
                  onSelectItem={(row) => {
                    const match = feed.items.find((item) => item.id === row.id);
                    if (match) setSelectedKey(stationHistoryTaskKey(match));
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {feed.hasNextPage ? (
        <footer className="shrink-0 border-t border-border-subtle p-3">
          <Button
            variant="secondary"
            size="lg"
            radius="surface"
            className="min-h-11 w-full"
            loading={feed.isFetchingNextPage}
            onClick={() => { void feed.fetchNextPage(); }}
          >
            Load earlier
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
