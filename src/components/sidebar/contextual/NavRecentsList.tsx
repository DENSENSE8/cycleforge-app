'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { NavRecentRow, NavRecents, NavSearch } from '@/lib/nav/context/schema';
import { fetchNavRecents, postNavRecent, runNavRecentRowVerb } from '@/lib/nav/context/http-client';
import { getNavRecentSurface } from '@/lib/nav/recents/surfaces';
import { useNavLiveRecent } from '@/lib/nav/recents/live';
import { groupByRecency } from '@/lib/assistant/session-groups';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { altDigitChord, altDigitSlot, chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LayoutGroup, motion } from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { MoreVertical, Pencil, Trash2 } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_BLOCK_PLATE_CLASS } from './nav-block';
import { NavSlotError } from './NavSlotError';

const RECENTS_STALE_MS = 30_000;

type RowActions = NonNullable<NavRecents['rowActions']>;

/**
 * `NavContext.recents` — THE recents list, one renderer for every surface
 * (Chat's threads, Unbox, Packing, Labels…). Everything a surface does is
 * declared on the contract (`recents`) or the surface registry; nothing here
 * knows a surface by name:
 *
 * - rows fall into local-calendar recency groups (Today · Yesterday · 7 · 30
 *   days · Older), split by a HAIRLINE — never a text heading; the group name
 *   is the list's accessible name (the `NavSectionList` category law);
 * - the lit row (one shared plate) is the record the URL opens, else the
 *   page's live record (`useNavLiveRecent`) — which also shows on top before
 *   the feed lists it (a chat thread whose first turn is in flight);
 * - `find`: the page's Find narrows the list (`q`); `paged`: "Load more"
 *   follows the response's `nextBefore`; `rowActions`: a hover `⋮` menu
 *   (Rename inline · Delete with Undo) writing to the feed owner's route;
 * - the surface's `refreshOn` events refetch it, and its own verbs fire
 *   `changedEvent` so the feed's other lists re-read.
 *
 * Opening a row on a `nav_recents`-backed surface records the open
 * (`POST /api/nav/recents`); adapter feeds are written by their own flows.
 */
export function NavRecentsList({
  recents,
  search,
  leadingHairline,
}: {
  recents: NavRecents;
  search: NavSearch;
  /** Rows above (views, verbs): the list opens with a hairline. */
  leadingHairline: boolean;
}) {
  const queryClient = useQueryClient();
  const surface = getNavRecentSurface(recents.surface);
  const q = useFindText(search, recents.find === true);
  const baseKey = useMemo(() => ['nav-recents', recents.endpoint] as const, [recents.endpoint]);
  const query = useInfiniteQuery({
    queryKey: [...baseKey, q],
    queryFn: ({ pageParam, signal }) => fetchNavRecents(recents.endpoint, { before: pageParam, q, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (recents.paged ? (last.nextBefore ?? undefined) : undefined),
    staleTime: RECENTS_STALE_MS,
    placeholderData: keepPreviousData,
  });
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: baseKey }), [queryClient, baseKey]);

  const refreshOn = surface?.refreshOn;
  useEffect(() => {
    if (!refreshOn?.length) return undefined;
    const onChange = () => void refresh();
    for (const event of refreshOn) window.addEventListener(event, onChange);
    return () => {
      for (const event of refreshOn) window.removeEventListener(event, onChange);
    };
  }, [refreshOn, refresh]);

  const fetched = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((page) => page.rows)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  }, [query.data]);

  const pathname = usePathname() || '/';
  const params = useSearchParams();

  // The page's live record, on top until the feed lists it. Each step it
  // takes while unlisted (it appears, its title settles, the URL opens it
  // when the first turn lands) refetches once: the server row lands with one.
  const live = useNavLiveRecent(recents.surface);
  const listed = live !== null && fetched.some((row) => row.id === live.id);
  const liveStep = live ? `${live.id}\n${live.title}\n${hrefIsOpen(live.href, pathname, params)}` : null;
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!liveStep || listed || !query.data || refetchedFor.current === liveStep) return;
    refetchedFor.current = liveStep;
    void refresh();
  }, [liveStep, listed, query.data, refresh]);
  // Not while Find narrows the list: the live record may not match.
  const optimisticId = live && !listed && !q ? live.id : null;
  const rows = useMemo(
    () => (live && optimisticId ? [{ ...live, at: new Date().toISOString() }, ...fetched] : fetched),
    [live, optimisticId, fetched],
  );

  const litId = useMemo(() => {
    const opened = rows.find((row) => hrefIsOpen(row.href, pathname, params));
    return opened?.id ?? live?.id ?? null;
  }, [rows, pathname, params, live]);

  const groups = useMemo(() => groupByRecency(rows, new Date(), (row) => row.at), [rows]);
  // ⌥1…⌥0 open the first ten rows in painted order (`recents.chords`).
  const chordRows = useMemo(
    () => (recents.chords ? groups.flatMap((group) => group.rows).slice(0, 10) : []),
    [recents.chords, groups],
  );
  const router = useRouter();
  const apple = useApplePlatform();

  const recordOpen = (row: NavRecentRow) => {
    if (surface?.source !== 'nav_recents') return;
    void postNavRecent({ surface: recents.surface, entityType: row.entityType, entityId: row.entityId, label: row.title })
      .then(() => refresh())
      .catch(() => undefined);
  };
  const recordOpenRef = useRef(recordOpen);
  recordOpenRef.current = recordOpen;

  const changedEvent = surface?.changedEvent;
  const afterVerb = useCallback(() => {
    void refresh();
    if (changedEvent) window.dispatchEvent(new CustomEvent(changedEvent));
  }, [refresh, changedEvent]);

  useEffect(() => {
    if (chordRows.length === 0) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      // Never mid-rename in this list or with a row menu open: the chord
      // would navigate away and drop the edit.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-nav-recents] input, [role="menu"]')) return;
      const slot = altDigitSlot(event);
      const row = slot === null ? undefined : chordRows[slot];
      if (!row) return;
      // Typing included: ⌥digit types nothing on Windows / Linux and a rare
      // symbol on macOS, so the chord wins in the composer too.
      event.preventDefault();
      event.stopPropagation();
      if (surface?.source === 'nav_recents') recordOpenRef.current(row);
      router.push(row.href);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [chordRows, router, surface?.source]);

  const hairline = <div role="separator" className="mx-2 mb-1.5 mt-1 h-px bg-border-hairline" />;

  return (
    <SidebarGroup aria-label="Recent" data-nav-recents={recents.surface} className="gap-px px-2 py-0.5">
      {leadingHairline ? hairline : null}
      {query.isError && !query.data ? (
        <NavSlotError label="Recents unavailable" onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <div className="flex flex-col gap-1.5 px-2 py-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : groups.length === 0 ? (
        <p className="px-2 py-1 text-role-caption text-text-faint">{q ? 'No matches' : 'Nothing opened yet'}</p>
      ) : (
        <LayoutGroup id={`nav-recents:${recents.surface}`}>
          {groups.map((group, index) => (
            <div key={group.key} className="flex min-w-0 flex-col">
              {index > 0 ? hairline : null}
              <SidebarMenu aria-label={group.label} data-nav-recents-group={group.key}>
                {group.rows.map((row) => (
                  <RecentRow
                    key={row.id}
                    row={row}
                    lit={row.id === litId}
                    chord={chordFace(chordRows.indexOf(row), apple)}
                    rowActions={row.id === optimisticId ? undefined : recents.rowActions}
                    onOpen={() => recordOpen(row)}
                    onChanged={afterVerb}
                  />
                ))}
              </SidebarMenu>
            </div>
          ))}
          {query.hasNextPage ? (
            <button
              type="button"
              data-nav-recents-more
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
              className={cn(NAV_BLOCK_CLASS, 'mt-0.5 h-8 text-role-caption text-text-muted disabled:opacity-60')}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </LayoutGroup>
      )}
    </SidebarGroup>
  );
}

/** What the page's Find holds, when Find narrows this list (`recents.find`). */
function useFindText(search: NavSearch, enabled: boolean): string {
  const pathname = usePathname() || '/';
  const [deskText] = useDeskSearch(pathname);
  const params = useSearchParams();
  if (!enabled) return '';
  if (search.source === 'desk-store') return deskText.trim();
  if (search.source === 'url-param') return (params?.get(search.param ?? 'q') ?? '').trim();
  return '';
}

/** A row is open when the URL is on its pathname and carries every param its href sets. */
function hrefIsOpen(href: string, pathname: string, params: Pick<URLSearchParams, 'get'> | null): boolean {
  const target = new URL(href, 'http://nav.local');
  if (target.pathname !== pathname) return false;
  let any = false;
  for (const [key, value] of target.searchParams) {
    any = true;
    if (params?.get(key) !== value) return false;
  }
  return any;
}

function chordFace(slot: number, apple: boolean): string[] | null {
  return slot < 0 ? null : chordKeys(altDigitChord(slot), apple);
}

function RecentRow({
  row,
  lit,
  chord,
  rowActions,
  onOpen,
  onChanged,
}: {
  row: NavRecentRow;
  lit: boolean;
  /** The row's ⌥-digit chord, when it is one of the first ten on a `chords` surface — taught in the row's hover tooltip. */
  chord: string[] | null;
  /** Absent on a row the feed has not listed yet: there is nothing to rename or delete. */
  rowActions: RowActions | undefined;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const plateTransition = useMotionTransition(motionTransition.sliderIndicator);
  const [editing, setEditing] = useState(false);
  const canRename = rowActions?.verbs.includes('rename') ?? false;
  const canDelete = rowActions?.verbs.includes('delete') ?? false;

  const remove = async () => {
    if (!rowActions) return;
    try {
      await runNavRecentRowVerb(rowActions, row.entityId, { kind: 'delete' });
    } catch {
      toast.error(`Could not delete “${row.title}”`);
      return;
    }
    onChanged();
    toast.undo(`Deleted “${row.title}”`, {
      onUndo: async () => {
        try {
          await runNavRecentRowVerb(rowActions, row.entityId, { kind: 'restore' });
          onChanged();
          toast.success(`Restored “${row.title}”`);
        } catch {
          toast.error(`Could not restore “${row.title}”`);
        }
      },
    });
  };

  if (editing && rowActions) {
    return (
      <SidebarMenuItem>
        <RenameField
          title={row.title}
          onDone={async (next) => {
            setEditing(false);
            if (!next || next === row.title) return;
            try {
              await runNavRecentRowVerb(rowActions, row.entityId, { kind: 'rename', title: next });
              onChanged();
            } catch {
              toast.error(`Could not rename “${row.title}”`);
            }
          }}
          onCancel={() => setEditing(false)}
        />
      </SidebarMenuItem>
    );
  }

  const menu = canRename || canDelete;
  return (
    <SidebarMenuItem className="group/recent">
      <HoverTooltip label={row.title} shortcut={chord ? chord.join(' + ') : undefined} disabled={!chord} asChild>
        <Link
          href={row.href}
          prefetch={false}
          aria-current={lit ? 'page' : undefined}
          aria-keyshortcuts={chord ? chord.join('+') : undefined}
          data-nav-recent={row.entityId}
          data-sidebar-nav-item
          onClick={onOpen}
          className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', lit && 'font-medium', menu && 'pr-8')}
        >
          {lit ? (
            <motion.span aria-hidden layoutId="nav-recent-plate" transition={plateTransition} className={NAV_BLOCK_PLATE_CLASS} />
          ) : null}
          <span className="min-w-0 flex-1 truncate" title={chord ? undefined : row.title}>
            {row.title}
          </span>
          {row.subtitle ? <span className="shrink-0 truncate text-role-micro text-text-faint">{row.subtitle}</span> : null}
        </Link>
      </HoverTooltip>
      {menu ? (
        // Outside the link so opening the menu never opens the record.
        <div
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity',
            'group-hover/recent:opacity-100 group-focus-within/recent:opacity-100 has-[[data-state=open]]:opacity-100',
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                size="xs"
                ariaLabel={`Actions — ${row.title}`}
                icon={<MoreVertical className="h-4 w-4" />}
                className="text-text-faint hover:bg-surface-sunken hover:text-text-default"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={2} className="min-w-[10rem]">
              {canRename ? (
                <DropdownMenuItem className="text-role-caption" onSelect={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Rename
                </DropdownMenuItem>
              ) : null}
              {canRename && canDelete ? <DropdownMenuSeparator /> : null}
              {canDelete ? (
                <DropdownMenuItem className="text-role-caption" tone="danger" onSelect={() => void remove()}>
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </SidebarMenuItem>
  );
}

function RenameField({
  title,
  onDone,
  onCancel,
}: {
  title: string;
  onDone: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onDone(draft.trim());
  };
  return (
    <input
      ref={inputRef}
      value={draft}
      autoFocus
      maxLength={200}
      aria-label={`Rename ${title}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          settled.current = true;
          onCancel();
        }
      }}
      className={cn(
        'h-8 w-full bg-surface-card px-2 text-role-body text-text-default ring-1 ring-inset ring-border-soft outline-none',
        SIDEBAR_CONTROL_CORNER,
        focusRing('control', 'accent'),
      )}
    />
  );
}
