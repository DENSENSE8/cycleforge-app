'use client';

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { NavLocateEntry, NavLocateResponse, NavLocateScope, NavSearch } from '@/lib/nav/context/schema';
import {
  FindField,
  FindLead,
  FindPanel,
  PasteKey,
  RollingHint,
  findHintTone,
  findHints,
  findWellClass,
  focusStaysIn,
  useHintActivity,
} from '@/design-system/components/FindField';
import { Search } from '@/components/Icons';
import { COMMAND_BAR_OPEN_CHANGE_EVENT, openCommandBar } from '@/lib/app-events';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hotkeyAriaShortcuts, PASTE_LIST_HOTKEY } from '@/lib/keyboard/key-registry';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { useLocalBulkList, type BulkList } from '@/lib/nav/locate/use-bulk-list';
import { useRecentLists, type RecentList } from '@/lib/nav/locate/recent-lists';
import { setDeskSearch, subscribeDeskSearchFocus, useDeskSearch } from '@/lib/outbound/desk-search-store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { BulkListToken, NavBulkDrop, useNavBulkList, usePasteListHotkey } from './NavBulkList';
import { recordsHref } from '@/lib/nav/route-tree';
import { useBulkListSort } from './bulk-list-view';
import { KeyHintPopover } from './NavGoKeys';
import { FIND_KEY, findKeyRows, useFindKeyCard } from './find-key-card';
import { NAV_LOCATE_MIN_QUERY, useNavLocate } from './useNavLocate';
import { NavLocateMatches } from './NavLocateMatches';
import { NavLocatePills, currentBucketId } from './NavLocatePills';

const PASTE_LIST_ARIA = hotkeyAriaShortcuts(PASTE_LIST_HOTKEY);

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
        { keys: ['mod', 'Shift', 'F'], label: 'Clear the find and the pasted list' },
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
 *   text field. The well keeps the sidebar's width — it never grows over the
 *   page; the sidebar's resize sash is how it gets wider.
 * - CONTEXTUAL — the page declares `search.locate`: the panel under the field
 *   shows where the text lives in the section (one pill per bucket with
 *   matches; a click opens that view with the text kept). A locator whose
 *   records open on their own (Support) also lists the matching records
 *   under the pills (NavLocateMatches): ↑↓ light one, ↵ / click opens it.
 *   Nowhere in the section → the ⌘K palette opens at once, searching
 *   everywhere for the text.
 * - GLOBAL — "Search everywhere" / ⌘↵ hands the text to the ⌘K palette.
 *   A page without a list (identify, the page map, the header) shows the
 *   palette's face instead.
 *
 * PASTE A LIST (owner 2026-10-04: the list lives IN the bar) — on every
 * face, a paste of 2+ numbers (⌘V in the field, the well's paste key, or
 * ⌘⇧V / Ctrl+Shift+V from anywhere outside a text field) becomes the HELD
 * list: one token inside the well (`40 numbers ×`), the list itself in the
 * well's own dropdown panel (NavBulkPanel). A page that locates keeps it in
 * its URL (`useNavBulkList`, so the page body's ledger agrees); any other
 * face holds it in memory, located everywhere (`useLocalBulkList`). One
 * number stays a Find (or the palette's query). Nothing hangs right of
 * the field.
 *
 * Hover the well (mouse, ~180ms intent) and a key card drops under it:
 * `F` + the page's Find (only where `F` is armed), ⌘K Search everywhere,
 * ⌘⇧V Paste a list. It is the field's only hint and hides while the field
 * has focus or its panel is open.
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

/**
 * Everything a face wraps its well in: the held list (token, panel, the
 * focus rules that open and close it, the chord) and the hover key card.
 * The panel opens on focus from outside, ↓, the token or the chord while a
 * list is held; it closes on Esc and when focus leaves the face.
 * `focusField` lands in the face's field (the input, or the everywhere
 * face's button).
 */
function useSearchFace(list: BulkList, findLabel: string | null, focusField: () => void) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sort, setSort] = useBulkListSort();
  const held = list.selection.refs.length;
  const card = useFindKeyCard(findKeyRows(findLabel, held), focused || open);
  const recent = useRecentLists();
  const hasRecent = recent.lists.length > 0;

  usePasteListHotkey(list, wrapRef, () => {
    focusField();
    setOpen(true);
  });
  const router = useRouter();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  // The list as the Records sheet; Esc there returns here.
  const backHere = () => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const openFull = () => {
    if (held === 0) return;
    setOpen(false);
    router.push(recordsHref({ refs: list.selection.refs, back: backHere() }));
  };
  // A recent list comes back through the paste path, then its panel opens.
  const restore = (item: RecentList) => {
    if (!list.paste(item.refs.join('\n'))) return;
    setOpen(true);
    focusField();
  };
  const openRecentFull = (item: RecentList) => {
    setOpen(false);
    router.push(recordsHref({ refs: item.refs, back: backHere() }));
  };
  const show = () => {
    setOpen(true);
    focusField();
  };
  // Focus first: landing in the field from inside the face never reopens it.
  const close = () => {
    focusField();
    setOpen(false);
  };
  const clear = () => {
    list.clear();
    setOpen(false);
  };

  return {
    hasList: held > 0,
    open,
    clear,
    /** The portaled panel — focus inside it is still the face's. */
    panelRef,
    /** A press outside the face and its panel: the panel goes, focus stays where the press put it. */
    dismiss: () => setOpen(false),
    /** A paste (⌘V, the paste key, a typed list + ↵): 2+ numbers become the list and it opens. */
    take: (text: string): boolean => {
      if (!list.paste(text)) return false;
      setOpen(true);
      return true;
    },
    /** ↓ opens the list, a second ↓ walks into it; Esc closes it before it clears or leaves the field. */
    fieldKey: (event: ReactKeyboardEvent): boolean => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        return true;
      }
      if (event.key !== 'ArrowDown' || event.metaKey || event.ctrlKey || event.altKey || held === 0) return false;
      if (open) listboxRef.current?.focus({ preventScroll: true });
      else setOpen(true);
      return true;
    },
    token: held > 0 ? <BulkListToken key="bulk-list" list={list} onOpen={show} onExpand={openFull} /> : null,
    drop: (find?: PageFind) => (
      <NavBulkDrop
        list={list}
        find={find}
        sort={sort}
        onSort={setSort}
        onClose={close}
        onLeave={focusField}
        onOpenFull={openFull}
        onRestore={restore}
        onOpenRecentFull={openRecentFull}
        listboxRef={listboxRef}
      />
    ),
    card: <KeyHintPopover id="find" enter="drop" at={card.at} rows={findKeyRows(findLabel, held)} />,
    bind: {
      ref: wrapRef,
      ...card.pointer,
      onFocusCapture: (event: FocusEvent<HTMLDivElement>) => {
        setFocused(true);
        // Focus from outside opens the held list — or, holding none, the recent lists.
        if ((held > 0 || hasRecent) && !focusStaysIn(event, panelRef)) setOpen(true);
      },
      onBlurCapture: (event: FocusEvent<HTMLDivElement>) => {
        if (focusStaysIn(event, panelRef)) return;
        setFocused(false);
        setOpen(false);
      },
    },
  };
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

/** A page list with no locator: a pasted list is held in memory and located everywhere. */
function PlainFind(props: PageFieldProps) {
  const list = useLocalBulkList('everywhere');
  return <PageFace {...props} list={list} />;
}

/**
 * Find + locate: the panel under the field says where the text lives in the
 * section (pills) and, for a locator whose records open on their own
 * (Support), lists the matching records; a multi-number paste becomes the
 * page's located list (in its URL, so the page body's own list follows it).
 */
function LocatedFind({ locate, ...props }: PageFieldProps & { locate: NonNullable<NavSearch['locate']> }) {
  const list = useNavBulkList(locate);
  return <PageFace {...props} list={list} locator={locate.locator} />;
}

/** A single answer, or the one whose `#<id>` is what was typed (`#12`, `12`). */
function exactMatch(entries: readonly NavLocateEntry[], typed: string): NavLocateEntry | undefined {
  if (entries.length === 1) return entries[0];
  const bare = typed.replace(/^#\s*/, '');
  return entries.find((entry) => entry.ref === `#${bare}`);
}

/**
 * Nowhere in this section → search everywhere, right away (operator
 * 2026-10-08): once the FRESH answer for the text in the field (not the
 * previous one still painted) has no bucket and no record, the ⌘K palette
 * opens already searching it. Only while the field has focus — the operator
 * is typing there — and once per text, so closing the palette never loops.
 */
function useEscalateWhenNowhere(
  /** The locate answer and whether it is the previous text's, still painted. */
  answer: NavLocateResponse | undefined,
  stale: boolean,
  asked: string,
  text: string,
  inputRef: RefObject<HTMLInputElement>,
): void {
  const handed = useRef('');
  const fresh = !stale && asked === text && asked.length >= NAV_LOCATE_MIN_QUERY;
  const nowhere = fresh && answer != null && answer.entries.length === 0 && !answer.buckets.some((bucket) => bucket.count > 0);
  useEffect(() => {
    if (!nowhere || handed.current === asked || document.activeElement !== inputRef.current) return;
    handed.current = asked;
    searchEverywhere(asked);
  }, [nowhere, asked, inputRef]);
}

/**
 * A page's Find well: its text narrows the list on screen; a held list rides
 * it as a token + panel. With a `locator`, the panel under the typed text
 * holds the locate pills and the matching records (NavLocateMatches): ↑↓
 * light a match, ↵ opens the lit one — or, with none lit, the single /
 * exact match of the fresh answer; a click opens it; Esc clears the text,
 * which closes the panel. When the section holds nothing for the text, the
 * palette takes it over at once, searching everywhere (operator 2026-10-08).
 */
function PageFace({
  search,
  label,
  inputRef,
  list,
  locator,
}: PageFieldProps & { list: BulkList; locator?: NavLocateScope }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const params = useSearchParams();
  const [find, debounceMs] = usePageFind(search);
  const face = useSearchFace(list, label, () => inputRef.current?.focus());
  useClearFindChord(inputRef, () => {
    find.set('');
    face.clear();
  });
  const text = find.value.trim();
  const { located, asked } = useNavLocate(locator, { q: text });
  const answer = text.length >= NAV_LOCATE_MIN_QUERY ? located.data : undefined;
  const matches = answer?.entries ?? [];
  const current = currentBucketId(answer?.buckets ?? [], pathname, params);
  useEscalateWhenNowhere(located.data, located.isPlaceholderData, asked, text, inputRef);
  // The lit match belongs to one answer; a new text starts unlit.
  const [cursor, setCursor] = useState({ asked: '', index: -1 });
  const lit = cursor.asked === asked ? Math.min(cursor.index, matches.length - 1) : -1;
  const openRecord = (href: string) => router.push(href, { scroll: false });
  const fieldLabel = face.hasList ? 'Find in the pasted list' : label;
  return (
    <div {...face.bind} data-nav-search-well data-nav-find className="min-w-0">
      <FindField
        value={find.value}
        onChange={find.set}
        label={fieldLabel}
        hints={findHints(fieldLabel)}
        inputRef={inputRef}
        interceptPaste={face.take}
        debounceMs={debounceMs}
        escalate={searchEverywhere}
        lead={face.token}
        drop={face.drop(find)}
        // Holding no list, the panel is the recent lists — it steps aside once the field is typed in.
        dropOpen={face.open && (face.hasList || !find.value)}
        panelRef={face.panelRef}
        keyShortcuts={PASTE_LIST_ARIA}
        below={
          locator && text.length >= NAV_LOCATE_MIN_QUERY ? (
            <>
              <NavLocatePills answer={answer} current={current} text={text} find={find} />
              {answer ? (
                <NavLocateMatches
                  answer={answer}
                  current={current}
                  lit={lit}
                  onPoint={(index) => setCursor({ asked, index })}
                  onOpen={openRecord}
                  onOpenBucket={(bucket) => {
                    if (bucket.href) find.open(bucket.href, text);
                  }}
                />
              ) : null}
            </>
          ) : undefined
        }
        onClear={face.hasList ? face.clear : undefined}
        onKeyDown={(event, draft, clear) => {
          if (face.fieldKey(event)) {
            event.preventDefault();
            return;
          }
          const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
          if (plain && matches.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            // ↓ off the last match goes on to "Search everywhere" (FindField lights it).
            if (event.key === 'ArrowDown' && lit === matches.length - 1) {
              setCursor({ asked, index: -1 });
              return;
            }
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setCursor({ asked, index: Math.max(-1, Math.min(matches.length - 1, lit + step)) });
            return;
          }
          if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return;
          // A typed "A, B, C" + Enter is a list too.
          if (face.take(draft)) {
            event.preventDefault();
            clear();
            return;
          }
          const fresh = located.data && !located.isPlaceholderData && asked === draft.trim() ? located.data.entries : [];
          const target = matches[lit] ?? exactMatch(fresh, draft.trim());
          if (target?.recordHref) {
            event.preventDefault();
            openRecord(target.recordHref);
          }
        }}
      />
      {face.card}
    </div>
  );
}

/**
 * The everywhere face — the palette's clickable face (`CommandBar` owns the
 * chord). The SAME sunken well as the page field (`findWellClass`): words
 * rest gray on "Search" and turn black and roll what it finds while you look
 * at it (hover / focus); the paste key shows only then. A paste (the key, or
 * ⌘V while it has focus) of 2+ numbers is held and located everywhere, in
 * the panel under the well; anything else opens the palette already
 * searching it.
 */
function EverywhereFace() {
  const list = useLocalBulkList('everywhere');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const face = useSearchFace(list, null, () => buttonRef.current?.focus());
  const look = useHintActivity(face.panelRef);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === 'boolean') setPaletteOpen(detail.open);
    };
    window.addEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
  }, []);
  const take = (text: string) => {
    if (face.take(text)) {
      buttonRef.current?.focus();
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
    <div {...face.bind} data-find-slot className="relative flex h-8 min-w-0 flex-1">
      <div
        ref={wellRef}
        data-nav-search-well
        onPointerEnter={look.bind.onPointerEnter}
        onPointerLeave={look.bind.onPointerLeave}
        onFocusCapture={look.bind.onFocusCapture}
        onBlurCapture={look.bind.onBlurCapture}
        onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
          event.preventDefault();
          take(event.clipboardData.getData('text'));
        }}
        className={findWellClass('sidebar')}
      >
        <Search aria-hidden className="size-3.5 shrink-0 text-text-muted" />
        <FindLead>{face.token}</FindLead>
        <button
          ref={buttonRef}
          type="button"
          data-nav-search-everywhere
          aria-label="Search"
          aria-keyshortcuts={`Meta+K Control+K ${PASTE_LIST_ARIA}`}
          aria-expanded={paletteOpen}
          onClick={() => openCommandBar({ scope: 'everywhere' })}
          onKeyDown={(event) => {
            if (face.fieldKey(event)) event.preventDefault();
          }}
          className={cn(
            'ds-raw-button flex h-full min-w-0 flex-1 items-center text-left active:translate-y-px',
            SIDEBAR_CONTROL_CORNER,
            focusRing('control', 'accent'),
          )}
        >
          <span className="relative h-full min-w-0 flex-1">
            <RollingHint
              hints={EVERYWHERE_HINTS}
              active={look.active}
              className={cn('text-role-caption font-medium', findHintTone(look.active || paletteOpen))}
            />
          </span>
        </button>
        <PasteKey label="Paste to search or locate a list" shown={look.active} onPaste={() => void pasteKey()} />
      </div>
      <FindPanel open={face.open} anchorRef={wellRef} panelRef={face.panelRef} onClose={face.dismiss}>
        {face.drop()}
      </FindPanel>
      {face.card}
    </div>
  );
}
