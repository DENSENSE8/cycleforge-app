'use client';

/**
 * `/m/inbox` — the phone face of the Home inbox and its tracking watches.
 *
 * THE `/m` TWIN the desk header inbox owes. `SURFACE_LAW` §1 refuses a
 * desk-only surface, and the operator's own sentence for this verb is a floor
 * sentence, not a desk one (2026-09-22: *"if you are looking forward to
 * receiving a package … input a tracking number … as soon as the tracking
 * number is scanned on arrival"*) — the person who knows the number is
 * carrying a phone, and the person who scans the carton is standing at the
 * door with one.
 *
 * ONE JOB: watch a number, and read what landed. Surface class B (phone
 * browse), so it is flat hairline rows on the one white sheet — no rounded
 * islands, no `DataTable`, no second nav (`SURFACE_LAW` §5). There is no
 * sticky CTA because the commit is the composer at the top: the `+` beside the
 * field IS the primary action, and a second one at the thumb line would be two
 * doors to one verb.
 *
 * The three watch verbs come from `@/lib/notifications/watch-tracking-client`,
 * the SAME module the desk row calls. That is not tidiness: the boundary law
 * (`mobile-no-desktop-surface-components`) forbids importing
 * `src/components/quick-access/*` from here, so without a shared `src/lib`
 * verb this screen would have had to re-type the fetch — and a second copy of
 * a refusal string is a second product.
 *
 * NOT ENABLED IS NOT AN ERROR. Both endpoints answer 404 while the
 * `isHomeInbox` org flag is off (matching `/api/subscriptions/toggle`). That is
 * a configuration state, so it reads as one plain line. Painting it red would
 * teach the floor to distrust a screen that is working exactly as configured.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Loader2, Plus, X } from '@/components/Icons';
import { EmptyState, IconButton, Inset, TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { TAP_MIN_H_CLASS, TAPPABLE_ROW_CLASS } from '@/design-system/tokens/interaction';
import {
  listTrackingWatches,
  startTrackingWatch,
  stopTrackingWatch,
  TrackingWatchError,
  type TrackingWatchRow,
} from '@/lib/notifications/watch-tracking-client';
import type { InboxFeedDto, InboxItemDto } from '@/lib/notifications/types';
import { formatOpsStageTime } from '@/utils/date';
import { cn } from '@/utils/_cn';

const INBOX_QUERY_KEY = ['inbox', 'unread'] as const;
const WATCH_QUERY_KEY = ['my-day', 'watch', 'tracking'] as const;

/** The org flag is off. One sentence, in the voice of a setting, not a fault. */
const NOT_ENABLED = 'The inbox is not enabled for this workspace.';

/** Cookie session; never a cached answer for a feed the operator just changed. */
const FRESH: RequestInit = { credentials: 'include', cache: 'no-store' };

/**
 * `null` means "the flag is off", which is why the 404 is caught here and not
 * left to an error boundary: a query that THROWS on a configuration state
 * makes every consumer render a failure.
 */
async function fetchUnreadInbox(): Promise<InboxFeedDto | null> {
  const res = await fetch('/api/inbox?filter=unread', FRESH);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load your inbox (${res.status})`);
  return (await res.json()) as InboxFeedDto;
}

async function fetchTrackingWatches(): Promise<TrackingWatchRow[] | null> {
  try {
    return await listTrackingWatches();
  } catch (err) {
    if (err instanceof TrackingWatchError && err.status === 404) return null;
    throw err;
  }
}

const FACT_CLASS = 'text-role-micro text-text-muted';
const ROW_CLASS = cn(
  'flex w-full items-center gap-3 border-b border-border-hairline px-3 py-2 text-left',
  TAP_MIN_H_CLASS,
  TAPPABLE_ROW_CLASS,
);

/** Section label over a list — the phone's own eyebrow, same as `/m/pick`. */
function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-1.5 px-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
      {children}
    </h2>
  );
}

/**
 * The composer. Enter submits so a wedge scanner works without the operator
 * reaching for the button — a scan gun types the digits and presses Enter,
 * exactly as it does on the desk row.
 *
 * The field clears on SUCCESS only. A refused scan stays in the field, because
 * the refusal is usually a partial read ("Enter a full tracking number") and
 * re-scanning a label that is already in the box is a wasted trip to the
 * carton. The parent reports the refusal; this only decides what survives it.
 */
function WatchComposer({
  onSubmit,
  busy,
  notice,
  error,
}: {
  onSubmit: (value: string) => Promise<unknown>;
  busy: boolean;
  notice: string | null;
  error: string | null;
}) {
  const [value, setValue] = useState('');

  const commit = () => {
    const tracking = value.trim();
    if (!tracking || busy) return;
    onSubmit(tracking).then(
      () => setValue(''),
      () => {
        /* The mutation's own onError owns the message. */
      },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'flex items-center border border-border-hairline bg-surface-card',
          cornerClass('flush'),
        )}
      >
        <TextField
          label="Watch a tracking number"
          value={value}
          onChange={setValue}
          appearance="flush"
          className="min-w-0 flex-1"
          mono
          disabled={busy}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          data-testid="m-inbox-watch-input"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit();
          }}
        />
        <IconButton
          type="button"
          size="touch"
          ariaLabel="Watch this tracking number"
          title="Watch this tracking number"
          disabled={busy || value.trim().length === 0}
          onClick={commit}
          data-testid="m-inbox-watch-add"
          className="shrink-0 text-text-default"
          icon={
            busy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )
          }
        />
      </div>
      {error ? (
        <p role="alert" className="px-1 text-role-micro text-rose-600">
          {error}
        </p>
      ) : notice ? (
        <p className="px-1 text-role-micro text-text-soft">{notice}</p>
      ) : null}
    </div>
  );
}

/**
 * One standing watch. A pre-arrival row says what it is waiting for; an
 * arrived row names the carton it now follows, because those are two different
 * answers to "is my package here yet" and a shared phrasing would hide the one
 * fact the operator opened this screen for.
 */
function WatchRow({
  row,
  onStop,
  stopping,
}: {
  row: TrackingWatchRow;
  onStop: (tracking: string) => void;
  stopping: boolean;
}) {
  const tracking = row.tracking ?? '';
  return (
    <div
      data-testid="m-inbox-watch-row"
      className={cn(
        'flex w-full items-center gap-3 border-b border-border-hairline px-3 py-2',
        TAP_MIN_H_CLASS,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-role-caption text-text-default">
          {tracking || 'Unknown tracking'}
        </span>
        <span className={FACT_CLASS}>
          {row.preArrival
            ? 'Waiting to arrive'
            : row.receivingId
              ? `Carton #${row.receivingId}`
              : 'Arrived'}
          {row.updatedAtMs ? ` · ${formatOpsStageTime(new Date(row.updatedAtMs))}` : ''}
        </span>
      </div>
      <IconButton
        type="button"
        size="touch"
        ariaLabel={`Stop watching ${tracking || 'this tracking number'}`}
        title="Stop watching"
        disabled={stopping || !tracking}
        onClick={() => onStop(tracking)}
        data-testid="m-inbox-watch-stop"
        className="shrink-0 text-text-muted"
        icon={
          stopping ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <X className="h-5 w-5" aria-hidden />
          )
        }
      />
    </div>
  );
}

/**
 * One inbox row. The whole row is the link, and tapping it marks it read — a
 * separate "mark read" control would be a second tap for something the operator
 * has, by opening it, already done.
 */
function InboxRow({ item, onRead }: { item: InboxItemDto; onRead: (id: number) => void }) {
  return (
    <Link
      href={item.href}
      onClick={() => onRead(item.id)}
      data-testid="m-inbox-item"
      className={ROW_CLASS}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-role-caption text-text-default">
          {item.eventLabel}
          {item.collapseCount > 1 ? ` · ${item.collapseCount}×` : ''}
        </span>
        <span className={cn(FACT_CLASS, 'truncate')}>
          {item.trackingNumber ? (
            <span className="font-mono">{item.trackingNumber}</span>
          ) : (
            `${item.entityType} #${item.entityId}`
          )}
          {` · ${formatOpsStageTime(item.lastEventAt)}`}
        </span>
      </div>
    </Link>
  );
}

export function MobileInboxView() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watches = useQuery({
    queryKey: WATCH_QUERY_KEY,
    queryFn: fetchTrackingWatches,
    staleTime: 30_000,
  });
  const inbox = useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: fetchUnreadInbox,
    staleTime: 30_000,
  });

  /** One refusal path for both watch verbs: the server's sentence, or nothing reached it. */
  const reportWatchFailure = useCallback((err: unknown) => {
    if (err instanceof TrackingWatchError && err.status === 404) {
      setNotice(NOT_ENABLED);
      return;
    }
    setError(err instanceof TrackingWatchError ? err.message : 'Could not reach the server.');
  }, []);

  const start = useMutation({
    mutationFn: startTrackingWatch,
    onMutate: () => {
      setError(null);
      setNotice(null);
    },
    onSuccess: (result) => {
      setNotice(
        result.alreadyWatching
          ? 'Already watching that one.'
          : result.preArrival
            ? 'Watching — you will be told when it lands.'
            : 'Watching that carton.',
      );
      void queryClient.invalidateQueries({ queryKey: WATCH_QUERY_KEY });
    },
    onError: reportWatchFailure,
  });

  const stop = useMutation({
    mutationFn: stopTrackingWatch,
    onMutate: (tracking: string) => {
      setError(null);
      setNotice(null);
      // Optimistic: the row leaves under the thumb that pressed it. The
      // invalidate below is what makes it true.
      const previous = queryClient.getQueryData<TrackingWatchRow[] | null>(WATCH_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<TrackingWatchRow[]>(
          WATCH_QUERY_KEY,
          previous.filter((row) => row.tracking !== tracking),
        );
      }
      return { previous };
    },
    onError: (err, _tracking, context) => {
      if (context?.previous) queryClient.setQueryData(WATCH_QUERY_KEY, context.previous);
      reportWatchFailure(err);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WATCH_QUERY_KEY });
    },
  });

  const markRead = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`/api/inbox/${itemId}`, {
        ...FRESH,
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'read' }),
      });
      if (!res.ok) throw new Error(`Could not mark that read (${res.status})`);
    },
    onMutate: (itemId: number) => {
      // The feed is `filter=unread`, so a read row leaves it. Done before the
      // navigation the tap also starts — the operator must not come back to a
      // row they already opened.
      const previous = queryClient.getQueryData<InboxFeedDto | null>(INBOX_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<InboxFeedDto>(INBOX_QUERY_KEY, {
          items: previous.items.filter((row) => row.id !== itemId),
          counts: { ...previous.counts, unread: Math.max(0, previous.counts.unread - 1) },
        });
      }
      return { previous };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(INBOX_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
    },
  });

  const notEnabled = watches.data === null || inbox.data === null;
  const watchRows = watches.data ?? [];
  const items = inbox.data?.items ?? [];

  return (
    <div data-testid="m-inbox" className="flex h-full min-h-full flex-col bg-surface-card">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Inset space="chip" className="flex flex-col gap-4">
          <WatchComposer
            onSubmit={start.mutateAsync}
            busy={start.isPending}
            notice={notEnabled ? NOT_ENABLED : notice}
            error={notEnabled ? null : error}
          />

          {notEnabled ? null : (
            <>
              <section>
                <SectionLabel>Watching</SectionLabel>
                {watches.isPending ? (
                  <p className={cn(FACT_CLASS, 'px-1')}>Loading…</p>
                ) : watches.isError ? (
                  <p className={cn(FACT_CLASS, 'px-1')}>Could not load your watches.</p>
                ) : watchRows.length === 0 ? (
                  <p className={cn(FACT_CLASS, 'px-1')}>
                    Nothing watched. Add a tracking number above.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {watchRows.map((row) => (
                      <li key={`${row.tracking ?? 'unknown'}-${row.receivingId ?? 0}`}>
                        <WatchRow
                          row={row}
                          onStop={stop.mutate}
                          stopping={stop.isPending && stop.variables === row.tracking}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionLabel>Unread</SectionLabel>
                {inbox.isPending ? (
                  <p className={cn(FACT_CLASS, 'px-1')}>Loading…</p>
                ) : inbox.isError ? (
                  <EmptyState
                    tone="danger"
                    title="Couldn't load your inbox"
                    description="Pull back to this screen to retry."
                  />
                ) : items.length === 0 ? (
                  <EmptyState
                    icon={<Inbox className="h-6 w-6 text-text-faint" />}
                    title="Nothing unread"
                    description="Arrivals you watch land here."
                  />
                ) : (
                  <ul className="flex flex-col">
                    {items.map((item) => (
                      <li key={item.id}>
                        <InboxRow item={item} onRead={markRead.mutate} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </Inset>
      </div>
    </div>
  );
}
