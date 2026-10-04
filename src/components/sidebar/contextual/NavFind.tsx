'use client';

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { NavLocateBucket, NavLocateScope, NavSearch } from '@/lib/nav/context/schema';
import {
  FindField,
  FindLead,
  FindPanel,
  HINT_INTENT_MS,
  PasteKey,
  RollingHint,
  findHintTone,
  findHints,
  findWellClass,
  useHintActivity,
} from '@/design-system/components/FindField';
import { Search } from '@/components/Icons';
import { COMMAND_BAR_OPEN_CHANGE_EVENT, openCommandBar } from '@/lib/app-events';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hotkeyAriaShortcuts, hotkeyKeys, hotkeyMatches, PASTE_LIST_HOTKEY } from '@/lib/keyboard/key-registry';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { useLocalBulkList, type BulkList } from '@/lib/nav/locate/use-bulk-list';
import { setDeskSearch, subscribeDeskSearchFocus, useDeskSearch } from '@/lib/outbound/desk-search-store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { BulkListToken, NavBulkDrop, useNavBulkList, usePasteListHotkey } from './NavBulkList';
import { KeyHintPopover, type KeyHintAt, type KeyHintRow } from './NavGoKeys';
import { PRESS_BEAT_MS, publishKeyPressed } from './go-keys-store';
import { NAV_LOCATE_MIN_QUERY, useNavLocate } from './useNavLocate';
import { NAV_LOCATE_TONE_VAR } from './nav-locate-tone';

/** The one hotkey that lands in the field. Bare `F`, never while typing. */
const FIND_KEY = 'f';
/** The palette's chord, taught by the key card (`CommandBar` owns it). */
const EVERYWHERE_HOTKEY = 'mod+k';
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
 *   text field. While focused the well grows right over the header, so the
 *   words and the panel under it are readable (`FindField overflowRight`).
 * - CONTEXTUAL — the page declares `search.locate`: the panel under the field
 *   shows where the text lives in the section (one pill per bucket with
 *   matches; a click opens that view with the text kept).
 * - GLOBAL — "Search everywhere" / ⌘↵ hands the text to the ⌘K palette.
 *   A page without a list (identify, the page map, the header) shows the
 *   palette's face instead.
 *
 * PASTE A LIST (owner 2026-10-04: the list lives IN the bar) — on every
 * face, a paste of 2+ numbers (⌘V in the field, the well's paste key, or
 * ⌘⌥V / Ctrl+Alt+V from anywhere outside a text field) becomes the HELD
 * list: one token inside the well (`40 numbers ×`), the list itself in the
 * well's own dropdown panel (NavBulkPanel). A page that locates keeps it in
 * its URL (`useNavBulkList`, so the page body's ledger agrees); any other
 * face holds it in memory, located everywhere (`useLocalBulkList`). One
 * number stays a Find (or the palette's query). Nothing hangs right of
 * the field.
 *
 * Hover the well (mouse, ~180ms intent) and a key card drops under it:
 * `F` + the page's Find (only where `F` is armed), ⌘K Search everywhere,
 * ⌘⌥V Paste a list. It is the field's only hint and hides while the field
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

/** The key card's rows, hotkey first. `findLabel` null = `F` is not armed on this face. */
function findKeyRows(findLabel: string | null, held: number): KeyHintRow[] {
  const rows: KeyHintRow[] = [];
  if (findLabel) rows.push({ id: 'find', keys: ['F'], pressedId: 'find:f', label: findLabel });
  rows.push(
    { id: 'everywhere', keys: hotkeyKeys(EVERYWHERE_HOTKEY), pressedId: 'find:k', label: 'Search everywhere' },
    {
      id: 'paste',
      keys: hotkeyKeys(PASTE_LIST_HOTKEY),
      pressedId: 'find:paste',
      label: 'Paste a list — check each number',
      count: held > 0 ? held : undefined,
    },
  );
  return rows;
}

/** Which taught row this keydown presses, if any. */
function taughtPress(event: KeyboardEvent, rows: readonly KeyHintRow[]): string | null {
  const id = hotkeyMatches(PASTE_LIST_HOTKEY, event)
    ? 'find:paste'
    : hotkeyMatches(EVERYWHERE_HOTKEY, event)
      ? 'find:k'
      : !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableKeyTarget(event.target) && hotkeyMatches(FIND_KEY, event)
        ? 'find:f'
        : null;
  return id && rows.some((row) => row.pressedId === id) ? id : null;
}

/** The card hangs this far under the well. */
const KEY_CARD_GAP_PX = 6;

/**
 * The search well's hover key card: mouse on the well for HINT_INTENT_MS →
 * the card drops under it, left-aligned (measured then, so collapse and
 * resize never leave it stale); pointer off → it leaves. Hidden while
 * `suppressed` (the field has focus or its panel is open) — except for one
 * beat after a taught key fires while it is up: that cap sinks
 * (`publishKeyPressed`), then the card leaves.
 */
function useFindKeyCard(rows: readonly KeyHintRow[], suppressed: boolean) {
  const [at, setAt] = useState<KeyHintAt | null>(null);
  const [beat, setBeat] = useState(false);
  const intent = useRef<number | undefined>(undefined);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const shown = at !== null && (!suppressed || beat);

  useEffect(() => () => window.clearTimeout(intent.current), []);
  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const id = taughtPress(event, rowsRef.current);
      if (!id) return;
      publishKeyPressed(id);
      setBeat(true);
      window.setTimeout(() => {
        setBeat(false);
        setAt(null);
      }, PRESS_BEAT_MS);
    };
    // Capture: the key's own owner may stop it before it bubbles.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [shown]);

  return {
    at: shown ? at : null,
    pointer: {
      onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'mouse') return;
        const well = event.currentTarget;
        window.clearTimeout(intent.current);
        intent.current = window.setTimeout(() => {
          const rect = well.getBoundingClientRect();
          setAt({ left: rect.left, top: rect.bottom + KEY_CARD_GAP_PX });
        }, HINT_INTENT_MS);
      },
      onPointerLeave: () => {
        window.clearTimeout(intent.current);
        setAt(null);
      },
    },
  };
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
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = list.selection.refs.length;
  const card = useFindKeyCard(findKeyRows(findLabel, held), focused || open);

  usePasteListHotkey(list, wrapRef, () => {
    focusField();
    setOpen(true);
  });
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
    token: held > 0 ? <BulkListToken key="bulk-list" list={list} onOpen={show} /> : null,
    drop: (find?: PageFind) => (
      <NavBulkDrop list={list} find={find} onClose={close} onLeave={focusField} listboxRef={listboxRef} />
    ),
    card: <KeyHintPopover id="find" enter="drop" at={card.at} rows={findKeyRows(findLabel, held)} />,
    bind: {
      ref: wrapRef,
      ...card.pointer,
      onFocusCapture: (event: FocusEvent<HTMLDivElement>) => {
        setFocused(true);
        if (held > 0 && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(true);
      },
      onBlurCapture: (event: FocusEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
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
 * section (pills), and a multi-number paste becomes the page's located list
 * (in its URL, so the page body's own list follows it).
 */
function LocatedFind({ locate, ...props }: PageFieldProps & { locate: NonNullable<NavSearch['locate']> }) {
  const list = useNavBulkList(locate);
  return (
    <PageFace
      {...props}
      list={list}
      below={(find, query) => <NavLocatePills scope={locate.locator} query={query} find={find} />}
    />
  );
}

/** A page's Find well: its text narrows the list on screen; a held list rides it as a token + panel. */
function PageFace({
  search,
  label,
  inputRef,
  list,
  below,
}: PageFieldProps & { list: BulkList; below?: (find: PageFind, query: string) => ReactNode }) {
  const [find, debounceMs] = usePageFind(search);
  const face = useSearchFace(list, label, () => inputRef.current?.focus());
  useClearFindChord(inputRef, () => {
    find.set('');
    face.clear();
  });
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
        overflowRight
        lead={face.token}
        drop={face.drop(find)}
        dropOpen={face.open}
        keyShortcuts={PASTE_LIST_ARIA}
        below={below?.(find, find.value)}
        onClear={face.hasList ? face.clear : undefined}
        onKeyDown={(event, draft, clear) => {
          if (face.fieldKey(event)) {
            event.preventDefault();
            return;
          }
          // A typed "A, B, C" + Enter is a list too.
          if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && face.take(draft)) {
            event.preventDefault();
            clear();
          }
        }}
      />
      {face.card}
    </div>
  );
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
 * at it (hover / focus); the paste key shows only then. A paste (the key, or
 * ⌘V while it has focus) of 2+ numbers is held and located everywhere, in
 * the panel under the well; anything else opens the palette already
 * searching it.
 */
function EverywhereFace() {
  const look = useHintActivity();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const list = useLocalBulkList('everywhere');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const face = useSearchFace(list, null, () => buttonRef.current?.focus());
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
    <div {...face.bind} className="relative flex min-w-0 flex-1">
      <div
        data-nav-search-well
        data-find-expanded={face.open ? '' : undefined}
        {...look.bind}
        onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
          event.preventDefault();
          take(event.clipboardData.getData('text'));
        }}
        className={cn(findWellClass('sidebar'), 'flex-1')}
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
      <FindPanel open={face.open}>{face.drop()}</FindPanel>
      {face.card}
    </div>
  );
}
