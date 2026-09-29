'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { NavLocateBucket, NavLocateScope, NavSearch } from '@/lib/nav/context/schema';
import {
  FindField,
  HoverKeycaps,
  PasteKey,
  RollingHint,
  findHintTone,
  findHints,
  findWellClass,
  useHintActivity,
} from '@/design-system/components/FindField';
import { Search } from '@/components/Icons';
import { COMMAND_BAR_OPEN_CHANGE_EVENT, openCommandBar } from '@/lib/app-events';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { setDeskSearch, subscribeDeskSearchFocus, useDeskSearch } from '@/lib/outbound/desk-search-store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { NavBulkPasteKey, NavBulkToggle, useLocalBulkList, useNavBulkList, type BulkList } from './NavBulkList';
import { NAV_LOCATE_MIN_QUERY, useNavLocate } from './useNavLocate';
import { NAV_LOCATE_TONE_VAR } from './nav-locate-tone';

/** The one hotkey that lands in the field. Bare `F`, never while typing. */
const FIND_KEY = 'f';

/**
 * ⌘/Ctrl+Shift+F — clear the page's Find from anywhere, in one press, and
 * land in the empty field (owner 2026-09-28: no F → select-all → Backspace
 * dance). A modifier chord, so no wedge scanner can fire it; it fires from a
 * text field too. Only the field on screen answers (two NavFinds can mount).
 */
function isClearFindChord(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.repeat) return false;
  return event.code === 'KeyF' || event.key.toLowerCase() === 'f';
}

function useClearFindChord(inputRef: RefObject<HTMLInputElement>, clear: () => void): void {
  const clearRef = useRef(clear);
  clearRef.current = clear;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isClearFindChord(event)) return;
      const input = inputRef.current;
      if (!input || input.offsetWidth === 0 || input.getClientRects().length === 0) return;
      event.preventDefault();
      clearRef.current();
      input.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    const unregister = registerShortcutOverviewGroup({
      id: 'find-clear',
      title: 'Find',
      rows: [
        { keys: ['F'], label: 'Find on this page' },
        { keys: ['mod', 'Shift', 'F'], label: 'Clear the find' },
      ],
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, [inputRef]);
}

/** What the everywhere face rolls while you look at it: rest "Search", then what it finds. */
const EVERYWHERE_HINTS = ['Search', 'Order #, serial, tracking', 'Jump to any page', 'Paste a list to locate'] as const;

/** The page field's hand-off: the palette, already searching the text. */
const searchEverywhere = (query: string) => openCommandBar({ query: query || undefined, scope: 'everywhere' });

/**
 * THE search field — one per chrome (the sidebar's top band; the header's
 * nav cluster while the sidebar is closed). Search splits by the ANSWER:
 *
 * - PAGE — the page declares a list (`search.source` desk-store / url-param):
 *   typing narrows ONLY the list on screen, live. `F` focuses it outside a
 *   text field. While focused the well grows right over the header, so the
 *   words and the panel under it are readable (`FindField overflowRight`).
 * - CONTEXTUAL — the page declares `search.locate`: the panel under the field
 *   shows where the text lives in the section (one pill per bucket with
 *   matches; a click opens that view with the text kept), and a pasted list
 *   of 2+ numbers becomes the located list (NavBulkList, `[›] [B] N`).
 * - GLOBAL — "Search everywhere" / ⌘↵ hands the text to the ⌘K palette.
 *   A page without a list (identify, the page map, the header) shows the
 *   palette's face instead; a list pasted there is located everywhere.
 *
 * The scope is never painted inside the field: the view switcher under it
 * already names the list.
 */
export function NavFind({ search }: { search?: NavSearch }) {
  const list = search && search.source !== 'identify' ? search : undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!list) return;
    // Two NavFinds can be mounted at once: the collapsed sidebar keeps its
    // field (zero width) while the header shows its own. Only the one on
    // screen answers `F` / desk focus — the hidden one lets the event pass.
    const visible = () => {
      const input = inputRef.current;
      return input != null && input.offsetWidth > 0 && input.getClientRects().length > 0;
    };
    const focus = () => {
      if (!visible()) return;
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== FIND_KEY || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || isEditableKeyTarget(event.target) || !visible()) return;
      event.preventDefault();
      focus();
    };
    window.addEventListener('keydown', onKeyDown);
    const unsubscribe = subscribeDeskSearchFocus(focus);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
    };
  }, [list]);

  if (!list) {
    return (
      <div data-nav-search="everywhere" className="flex min-w-0 flex-1">
        <EverywhereFace />
      </div>
    );
  }
  const label = list.placeholder.replace(/^Search\b/, 'Find');
  return (
    <div data-nav-search="page" className="min-w-0 flex-1">
      {list.locate ? (
        <LocatedFind search={list} locate={list.locate} label={label} inputRef={inputRef} />
      ) : (
        <PlainFind search={list} label={label} inputRef={inputRef} />
      )}
    </div>
  );
}

type PageFieldProps = { search: NavSearch; label: string; inputRef: RefObject<HTMLInputElement> };

/**
 * The list's Find: its text, its setter, and how to open another list with
 * the text kept — the in-memory desk store (per pathname), or the declared
 * URL param (carried in the target href).
 */
export interface PageFind {
  value: string;
  set: (next: string) => void;
  open: (href: string, text: string) => void;
}

function usePageFind(search: NavSearch): [PageFind, number] {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [deskValue, setDeskValue] = useDeskSearch(pathname);
  const param = search.param ?? 'q';
  const urlValue = useSearchParams()?.get(param) ?? '';
  const replace = useReplaceSearchParams();
  if (search.source === 'desk-store') {
    const open = (href: string, text: string) => {
      setDeskSearch(new URL(href, 'http://local').pathname, text);
      router.push(href, { scroll: false });
    };
    return [{ value: deskValue, set: setDeskValue, open }, 150];
  }
  const set = (next: string) =>
    replace((params) => {
      if (next.trim()) params.set(param, next);
      else params.delete(param);
    });
  const open = (href: string, text: string) => {
    const url = new URL(href, 'http://local');
    if (text.trim()) url.searchParams.set(param, text);
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  };
  return [{ value: urlValue, set, open }, 250];
}

function PlainFind({ search, label, inputRef }: PageFieldProps) {
  const [find, debounceMs] = usePageFind(search);
  useClearFindChord(inputRef, () => find.set(''));
  return (
    <div data-nav-search-well data-nav-find>
      <FindField
        value={find.value}
        onChange={find.set}
        label={label}
        hints={findHints(label)}
        inputRef={inputRef}
        debounceMs={debounceMs}
        escalate={searchEverywhere}
        overflowRight
      />
    </div>
  );
}

/**
 * Find + locate: the panel under the field says where the text lives in the
 * section (pills), and a multi-number paste becomes the located list — the
 * `[›] [B] N` key right of the well opens it. A single number stays a plain
 * Find over the list on screen.
 */
function LocatedFind({ search, locate, label, inputRef }: PageFieldProps & { locate: NonNullable<NavSearch['locate']> }) {
  const [find, debounceMs] = usePageFind(search);
  const list = useNavBulkList(locate);
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasList = list.selection.refs.length > 0;
  useClearFindChord(inputRef, () => {
    find.set('');
    list.clear();
    setOpen(false);
  });
  const fieldLabel = hasList ? 'Find in the pasted list' : label;
  return (
    <div ref={rowRef} data-nav-find-row className="flex min-w-0 items-center gap-1">
      <div data-nav-search-well data-nav-find className="min-w-0 flex-1">
        <FindField
          value={find.value}
          onChange={find.set}
          label={fieldLabel}
          hints={findHints(fieldLabel)}
          inputRef={inputRef}
          // A pasted list opens at once: while focused the grown well covers the `[›]` key.
          interceptPaste={(text) => {
            const took = list.paste(text);
            if (took) setOpen(true);
            return took;
          }}
          debounceMs={debounceMs}
          escalate={searchEverywhere}
          overflowRight
          below={<NavLocatePills scope={locate.locator} query={find.value} find={find} />}
          onClear={
            hasList
              ? () => {
                  list.clear();
                  setOpen(false);
                }
              : undefined
          }
          onKeyDown={(event, draft, clear) => {
            // A typed "A, B, C" + Enter is a list too.
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && list.paste(draft)) {
              event.preventDefault();
              clear();
              setOpen(true);
            } else if (event.key === 'ArrowDown' && hasList) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
      </div>
      <BulkKey list={list} anchorRef={rowRef} open={open} setOpen={setOpen} find={find} pasteBox />
    </div>
  );
}

function BulkKey({
  list,
  anchorRef,
  open,
  setOpen,
  find,
  pasteBox = false,
}: {
  list: BulkList;
  anchorRef: RefObject<HTMLDivElement>;
  open: boolean;
  setOpen: (open: boolean) => void;
  find?: PageFind;
  /** With no list, the key opens an empty paste box (the page list's Find only). */
  pasteBox?: boolean;
}) {
  const hasList = list.selection.refs.length > 0;
  if (!hasList && pasteBox && find) {
    return <NavBulkPasteKey list={list} anchorRef={anchorRef} find={find} onListed={() => setOpen(true)} />;
  }
  return <NavBulkToggle list={list} anchorRef={anchorRef} open={open && hasList} onOpenChange={setOpen} find={find} />;
}

/**
 * Where the field's text lives in the section: one pill per bucket that
 * holds matches (glyph dot · label · count), the list on screen pressed in.
 * A click opens that bucket's list with the text kept as its Find.
 */
function NavLocatePills({ scope, query, find }: { scope: NavLocateScope; query: string; find: PageFind }) {
  const pathname = usePathname() || '/';
  const params = useSearchParams();
  const text = query.trim();
  const located = useNavLocate(scope, { q: text });
  if (text.length < NAV_LOCATE_MIN_QUERY) return null;
  const buckets = located.data?.buckets.filter((bucket) => bucket.count > 0) ?? [];
  const current = currentBucketId(located.data?.buckets ?? [], pathname, params);
  return (
    <div data-nav-locate-pills className="flex min-w-0 flex-wrap items-center gap-1 px-1 py-0.5">
      {!located.data ? (
        <span className="text-role-caption text-text-faint">Locating…</span>
      ) : buckets.length === 0 ? (
        <span className="text-role-caption text-text-faint">Nowhere in this section</span>
      ) : (
        buckets.map((bucket) => (
          <button
            key={bucket.id}
            type="button"
            data-nav-locate-pill={bucket.id}
            disabled={!bucket.href}
            aria-current={bucket.id === current ? 'true' : undefined}
            onClick={() => {
              if (bucket.href) find.open(bucket.href, text);
            }}
            className={cn(
              'ds-raw-button inline-flex h-6 min-w-0 items-center gap-1.5 bg-surface-card px-2 text-role-caption font-medium text-text-default ring-1 ring-inset ring-border-hairline',
              'hover:bg-surface-sunken active:translate-y-px disabled:cursor-default',
              bucket.id === current && NAV_CHOICE_SELECTED_CLASS,
              SIDEBAR_CONTROL_CORNER,
              focusRing('control', 'accent'),
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: NAV_LOCATE_TONE_VAR[bucket.tone] }} />
            <span className="truncate">{bucket.label}</span>
            <span className="tabular-nums text-text-muted">{bucket.count}</span>
          </button>
        ))
      )}
    </div>
  );
}

/** The bucket whose list is on screen: same pathname, every defining param present — the most specific wins. */
function currentBucketId(
  buckets: readonly NavLocateBucket[],
  pathname: string,
  params: Pick<URLSearchParams, 'get'> | null,
): string | undefined {
  let best: { id: string; specificity: number } | undefined;
  for (const bucket of buckets) {
    if (!bucket.href) continue;
    const url = new URL(bucket.href, 'http://x');
    if (url.pathname !== pathname) continue;
    const defining = [...url.searchParams.entries()];
    if (!defining.every(([key, value]) => params?.get(key) === value)) continue;
    if (!best || defining.length > best.specificity) best = { id: bucket.id, specificity: defining.length };
  }
  return best?.id;
}

/**
 * The everywhere face — the palette's clickable face (`CommandBar` owns the
 * chord). The SAME sunken well as the page field (`findWellClass`): words
 * rest gray on "Search" and turn black and roll what it finds while you look
 * at it (hover / focus); the ⌘K keycaps and the paste key show only then.
 * A paste (the key, or ⌘V while it has focus) of 2+ numbers is located
 * everywhere (NavBulkList, `[›] [B] N`); anything else opens the palette
 * already searching it.
 */
function EverywhereFace() {
  const apple = useApplePlatform();
  const look = useHintActivity();
  const [open, setOpen] = useState(false);
  const list = useLocalBulkList('everywhere');
  const rowRef = useRef<HTMLDivElement>(null);
  const [listOpen, setListOpen] = useState(false);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === 'boolean') setOpen(detail.open);
    };
    window.addEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
  }, []);
  const take = (text: string) => {
    if (list.paste(text)) {
      setListOpen(true);
      return;
    }
    openCommandBar({ query: text.trim() || undefined, scope: 'everywhere' });
  };
  const pasteKey = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // Clipboard blocked: the palette still opens, where ⌘V / Ctrl+V works.
    }
    take(text);
  };
  return (
    <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-1">
      <div
        data-nav-search-well
        {...look.bind}
        onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
          event.preventDefault();
          take(event.clipboardData.getData('text'));
        }}
        className={cn(findWellClass('sidebar'), 'flex-1')}
      >
        <button
          type="button"
          data-nav-search-everywhere
          aria-label="Search"
          aria-keyshortcuts="Meta+K Control+K"
          aria-expanded={open}
          onClick={() => openCommandBar({ scope: 'everywhere' })}
          className={cn(
            'ds-raw-button flex h-full min-w-0 flex-1 items-center gap-1.5 text-left active:translate-y-px',
            SIDEBAR_CONTROL_CORNER,
            focusRing('control', 'accent'),
          )}
        >
          <Search aria-hidden className="size-3.5 shrink-0 text-text-muted" />
          <HoverKeycaps keys={chordKeys('mod+k', apple)} shown={look.active} />
          <span className="relative h-full min-w-0 flex-1">
            <RollingHint
              hints={EVERYWHERE_HINTS}
              active={look.active}
              className={cn('text-role-caption font-medium', findHintTone(look.active || open))}
            />
          </span>
        </button>
        <PasteKey label="Paste to search or locate a list" shown={look.active} onPaste={() => void pasteKey()} />
      </div>
      <BulkKey list={list} anchorRef={rowRef} open={listOpen} setOpen={setListOpen} />
    </div>
  );
}
