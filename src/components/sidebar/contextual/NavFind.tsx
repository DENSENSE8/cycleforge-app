'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { NavSearch } from '@/lib/nav/context/schema';
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
import { COMMAND_BAR_OPEN_CHANGE_EVENT, COMMAND_BAR_OPEN_EVENT } from '@/lib/app-events';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { subscribeDeskSearchFocus, useDeskSearch } from '@/lib/outbound/desk-search-store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { NavBulkToggle, useNavBulkList } from './NavBulkList';

/** The one hotkey that lands in Find. Bare `F`, never while typing. */
const FIND_KEY = 'f';

/** What the ⌘K face rolls while you look at it: rest "Search", then what it finds. */
const GLOBAL_SEARCH_HINTS = ['Search', 'Order #, serial, tracking', 'Jump to any page', 'Paste to search'] as const;

/** Open the ⌘K palette, optionally with its query already typed. */
function openCommandBar(query?: string) {
  window.dispatchEvent(new CustomEvent(COMMAND_BAR_OPEN_EVENT, { detail: query ? { query } : undefined }));
}

/**
 * Global search — the ⌘K palette's clickable face (`CommandBar` owns the
 * chord): the sidebar's top row on every page, and the header's search while
 * the sidebar is closed (`GlobalHeaderSearch`). The SAME sunken well as Find
 * (`findWellClass`): words rest gray on "Search" and turn black and roll
 * what it finds while you look at it (hover / focus); the ⌘K keycaps and the
 * paste key (clipboard → the palette, already searching) show only then.
 */
export function NavGlobalSearch() {
  const apple = useApplePlatform();
  const look = useHintActivity();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === 'boolean') setOpen(detail.open);
    };
    window.addEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
  }, []);
  const pasteToSearch = async () => {
    let text = '';
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      // Clipboard blocked: the palette still opens, where ⌘V / Ctrl+V works.
    }
    openCommandBar(text || undefined);
  };
  return (
    <div data-nav-global-search-well {...look.bind} className={cn(findWellClass('sidebar'), 'flex-1')}>
      <button
        type="button"
        data-nav-global-search
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        aria-expanded={open}
        onClick={() => openCommandBar()}
        className={cn(
          'ds-raw-button flex h-full min-w-0 flex-1 items-center gap-1.5 text-left active:translate-y-px',
          SIDEBAR_CONTROL_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        <Search aria-hidden className="size-3.5 shrink-0 text-text-faint" />
        <HoverKeycaps keys={chordKeys('mod+k', apple)} shown={look.active} />
        <span className="relative h-full min-w-0 flex-1">
          <RollingHint
            hints={GLOBAL_SEARCH_HINTS}
            active={look.active}
            className={cn('text-role-caption font-medium', findHintTone(look.active || open))}
          />
        </span>
      </button>
      <PasteKey label="Paste to search" shown={look.active} onPaste={() => void pasteToSearch()} />
    </div>
  );
}

/**
 * Find — pinned under the ⌘K band and above `‹ <Page>`, narrows ONLY the list
 * on screen. `search.source` says where that list reads its query
 * (`desk-store` = the in-memory desk query keyed by pathname; `url-param` =
 * `search.param`). A page without a list of its own (`identify`) has no Find —
 * global search above covers it. The well is the shared `FindField`.
 *
 * `F` focuses it from anywhere on the page that is not a text field.
 */
export function NavFind({ search }: { search: NavSearch }) {
  if (search.source === 'identify') return null;
  const label = search.placeholder.replace(/^Search\b/, 'Find');
  return search.source === 'desk-store' ? (
    search.bulk ? (
      <BulkDeskStoreFind label={label} bulk={search.bulk} />
    ) : (
      <DeskStoreFind label={label} />
    )
  ) : (
    <UrlParamFind label={label} param={search.param ?? 'q'} />
  );
}

function useFindInput() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => {
      ref.current?.focus();
      ref.current?.select();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== FIND_KEY || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      focus();
    };
    window.addEventListener('keydown', onKeyDown);
    const unsubscribe = subscribeDeskSearchFocus(focus);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
    };
  }, []);
  return ref;
}

function DeskStoreFind({ label }: { label: string }) {
  const pathname = usePathname() || '/';
  const [value, setValue] = useDeskSearch(pathname);
  const inputRef = useFindInput();
  return (
    <div data-nav-find>
      <FindField value={value} onChange={setValue} label={label} hints={findHints(label)} inputRef={inputRef} debounceMs={150} />
    </div>
  );
}

/**
 * Find + paste-a-list: a multi-number paste becomes the pasted list (URL,
 * answered by the page's check), and the `[›] [B] N` key right of the well
 * opens it. A single number stays a plain Find over the list on screen.
 */
function BulkDeskStoreFind({ label, bulk }: { label: string; bulk: NonNullable<NavSearch['bulk']> }) {
  const pathname = usePathname() || '/';
  const [value, setValue] = useDeskSearch(pathname);
  const inputRef = useFindInput();
  const list = useNavBulkList(bulk);
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasList = list.selection.refs.length > 0;
  const fieldLabel = hasList ? 'Find in the pasted list' : label;
  return (
    <div ref={rowRef} data-nav-find-row className="flex min-w-0 items-center gap-1">
      <div data-nav-find className="min-w-0 flex-1">
        <FindField
          value={value}
          onChange={setValue}
          label={fieldLabel}
          hints={findHints(fieldLabel)}
          inputRef={inputRef}
          debounceMs={150}
          interceptPaste={list.paste}
          onKeyDown={(event, draft, clear) => {
            // A typed "A, B, C" + Enter is a list too.
            if (event.key === 'Enter' && list.paste(draft)) {
              event.preventDefault();
              clear();
            } else if (event.key === 'ArrowDown' && hasList) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
      </div>
      <NavBulkToggle list={list} anchorRef={rowRef} open={open && hasList} onOpenChange={setOpen} />
    </div>
  );
}

function UrlParamFind({ label, param }: { label: string; param: string }) {
  const value = useSearchParams()?.get(param) ?? '';
  const replace = useReplaceSearchParams();
  const inputRef = useFindInput();
  return (
    <div data-nav-find>
      <FindField
        value={value}
        label={label}
        hints={findHints(label)}
        inputRef={inputRef}
        debounceMs={250}
        onChange={(next) =>
          replace((params) => {
            if (next.trim()) params.set(param, next);
            else params.delete(param);
          })
        }
      />
    </div>
  );
}
