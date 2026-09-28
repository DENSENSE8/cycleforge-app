'use client';

/**
 * FindField — the ONE search well every "find in this list" box wears (the
 * sidebar's search field, the data-table bar's Find), plus its hint roll
 * ({@link RollingHint}), which the everywhere face reuses.
 *
 * The hint RESTS on its first phrase ("Find", "Search"). While the operator
 * is looking at the field — pointer over it, or it has focus (`F`, a click) —
 * the later phrases roll in top → bottom one after another, each held long
 * enough to read. Leaving rolls back to the rest phrase; the next look
 * resumes at the phrase after the last one shown.
 *
 * Two scopes, one field: typing narrows the list on screen; `escalate` hands
 * the same text to the palette ("Search everywhere", ⌘↵ / Ctrl+↵).
 */

import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { KeyboardKey } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SEARCH_WELL_CORNER, SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { ClipboardPaste, Search, X } from '@/components/Icons';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Hover intent: a pointer just passing through never starts a roll. */
const HINT_INTENT_MS = 180;
/** Each phrase holds this long — the eye is already on it, short phrases read fast. */
const HINT_HOLD_MS = 1_800;
/** Soft top/bottom edges: the line rolls in and out THROUGH the field's edge, not past a hard clip. */
const HINT_EDGE_MASK =
  '[mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]';

/**
 * Hover-or-focus = "looking at it". Spread `bind` on the element that owns
 * the hint (focus is captured, so an inner input counts).
 */
export function useHintActivity() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return {
    active: hovered || focused,
    focused,
    bind: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onFocusCapture: () => setFocused(true),
      onBlurCapture: (event: FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      },
    },
  };
}

/**
 * One rolling phrase: plain words, or words led by the keys that do them
 * (HOTKEY FIRST — `F` Find orders to ship, `⌘ K` Search everywhere), so a
 * field that does two jobs teaches both in the same line.
 */
export type FindHint = string | { keys: readonly string[]; text: string };

/**
 * The rolling phrase, absolutely filling its (relative) parent. `hints[0]` is
 * the rest face; `hints[1…]` roll while `active`.
 *
 * Motion: the whole phrase moves as ONE LINE — it drops in from above while
 * the outgoing phrase drops out below (critically damped spring, no
 * overshoot), both through a soft masked edge — so it reads in one glance,
 * never word by word. A keyed phrase rolls WITH its keys. A hover shorter
 * than the intent delay never rolls. Reduced motion keeps the swap as a
 * plain fade (`useMotionPresence` strips the travel).
 */
export function RollingHint({
  hints,
  active,
  className,
}: {
  hints: readonly FindHint[];
  active: boolean;
  className?: string;
}) {
  const tours = hints.length - 1;
  // `showing` 0 = rest; k ≥ 1 = hints[k]. `next` = the phrase a look resumes at.
  const [showing, setShowing] = useState(0);
  const next = useRef(1);
  const [turn, setTurn] = useState(0);
  const line = useMotionPresence(motionPresence.findHintRoll);
  const transition = useMotionTransition(motionTransition.findHintRoll);
  const key = hints.map((hint) => (typeof hint === 'string' ? hint : `${hint.keys.join('+')} ${hint.text}`)).join('|');
  const hint = hints[showing] ?? hints[0] ?? '';

  useEffect(() => {
    setShowing(0);
    next.current = 1;
  }, [key]);

  useEffect(() => {
    if (tours < 1) return;
    if (!active) {
      if (showing !== 0) {
        next.current = (showing % tours) + 1;
        setShowing(0);
        setTurn((t) => t + 1);
      }
      return;
    }
    const timer = window.setTimeout(
      () => {
        setShowing(showing === 0 ? next.current : (showing % tours) + 1);
        setTurn((t) => t + 1);
      },
      showing === 0 ? HINT_INTENT_MS : HINT_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, showing, tours]);

  return (
    <span aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', HINT_EDGE_MASK)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={`${key}:${turn}`}
          data-rolling-hint
          initial={line.initial}
          animate={line.animate}
          exit={line.exit}
          transition={transition}
          className={cn('absolute inset-0 flex items-center overflow-hidden whitespace-pre', className)}
        >
          {typeof hint === 'string' ? (
            hint
          ) : (
            <>
              <span className="mr-1.5 inline-flex shrink-0 items-center gap-0.5">
                {hint.keys.map((k) => (
                  <KeyboardKey key={k} size="xs">
                    {k}
                  </KeyboardKey>
                ))}
              </span>
              <span className="min-w-0 truncate">{hint.text}</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const FIELD_SIZE = {
  /** Sidebar well: 32px, 13px nav type — the operator reads it all day. */
  sidebar: { well: 'px-2.5', text: 'text-role-nav font-medium' },
  /** Data-table bar: 32px, body type. */
  bar: { well: 'px-2.5', text: 'text-role-body font-medium' },
} as const;

/**
 * Search icon · `F` keycap · field (rolling hint while empty) · paste key ·
 * clear (far right, expanded or not). The field keeps a local draft and commits after
 * `debounceMs`; a committed value coming back never overwrites keys typed
 * since.
 *
 * `overflowRight`: the operator's words outrank the layout — while the field
 * has focus the well grows RIGHT past its slot (over whatever sits beside
 * it: the header's task and pin keys), so the typed text, what it found and
 * the rows under it are all readable. The slot keeps its 32px, so nothing
 * around it moves; blur returns the well to the slot.
 *
 * While it has focus and text, a panel hangs under the well: `below` (the
 * caller's answer, e.g. where the text lives) then, with `escalate`, the
 * "Search everywhere" row (⌘↵ / Ctrl+↵).
 *
 * `onClear`: the caller holds something the field's text does not (a pasted
 * list), so the clear key shows without text. One click clears both: the
 * text and whatever `onClear` drops.
 */
export function FindField({
  value,
  onChange,
  label,
  hints,
  inputRef,
  debounceMs = 0,
  size = 'sidebar',
  interceptPaste,
  onKeyDown,
  testId,
  escalate,
  below,
  onClear,
  overflowRight = false,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Accessible name — the list's own "Find …". */
  label: string;
  /** Rest phrase first, then the phrases that roll (see {@link RollingHint}). */
  hints: readonly string[];
  inputRef: RefObject<HTMLInputElement>;
  debounceMs?: number;
  size?: keyof typeof FIELD_SIZE;
  /** Return true to take a paste (⌘V or the paste key) instead of the field. */
  interceptPaste?: (text: string) => boolean;
  /** Runs before the field's own Escape handling; `preventDefault` skips it. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>, draft: string, clear: () => void) => void;
  testId?: string;
  /** "Search everywhere": ⌘↵ / Ctrl+↵ or the row under the field hands the text on. */
  escalate?: (query: string) => void;
  /** Painted in the panel under the well while it has focus and text. */
  below?: ReactNode;
  /** Grow right past the slot while focused (see above). */
  overflowRight?: boolean;
  /** The caller has something to clear beyond the text (see above). */
  onClear?: () => void;
}) {
  const apple = useApplePlatform();
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const look = useHintActivity();
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === committed.current) return;
    const timer = window.setTimeout(() => {
      committed.current = draft;
      onChange(draft);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, debounceMs, onChange]);

  const pasteClipboard = useCallback(async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.info('Clipboard blocked — press ⌘V / Ctrl+V in Find instead');
      inputRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
    if (!text.trim() || interceptPaste?.(text)) return;
    setDraft(text.trim());
  }, [inputRef, interceptPaste]);

  const sized = FIELD_SIZE[size];
  // A field that also escalates teaches both jobs in one roll: `F` finds on
  // this page, ⌘K / Ctrl K searches everywhere. The keys ride in the phrase,
  // so no separate keycap sits in front of it.
  const rolled: readonly FindHint[] = escalate
    ? [hints[0] ?? 'Find', { keys: ['F'], text: hints[1] ?? 'Find' }, { keys: chordKeys('mod+k', apple), text: 'Everywhere' }, ...hints.slice(2)]
    : hints;
  const query = look.focused ? draft.trim() : '';
  const panel = query && (below || escalate);
  const well = (
    <div
      data-find-field
      data-find-expanded={overflowRight && look.focused ? '' : undefined}
      {...look.bind}
      className={cn(
        findWellClass(size),
        'relative',
        overflowRight &&
          'absolute inset-y-0 left-0 transition-[width,border-radius,box-shadow,filter] duration-150 focus-within:z-50 focus-within:w-[max(100%,28rem)] focus-within:drop-shadow-lg',
      )}
    >
      <Search aria-hidden className="size-3.5 shrink-0 text-text-muted" />
      {escalate ? null : <HoverKeycaps keys={['F']} shown={look.active} />}
      <span className="relative flex h-full min-w-0 flex-1">
        {draft ? null : <RollingHint hints={rolled} active={look.active} className={cn(sized.text, findHintTone(look.active))} />}
        <input
          ref={inputRef}
          type="search"
          value={draft}
          aria-label={label}
          aria-keyshortcuts={escalate ? 'F Meta+Enter Control+Enter' : 'F'}
          spellCheck={false}
          autoComplete="off"
          data-testid={testId}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            if (interceptPaste?.(event.clipboardData.getData('text'))) event.preventDefault();
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event, draft, () => setDraft(''));
            if (event.defaultPrevented) return;
            if (escalate && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              escalate(draft.trim());
              return;
            }
            if (event.key !== 'Escape') return;
            if (draft) setDraft('');
            else event.currentTarget.blur();
          }}
          className={cn(
            'relative h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-text-default caret-text-default outline-none focus:cursor-text [&::-webkit-search-cancel-button]:hidden',
            'selection:bg-[var(--ds-color-accent-light)] selection:text-text-default',
            sized.text,
          )}
        />
      </span>
      <PasteKey label="Paste to find" shown={look.active} onPaste={() => void pasteClipboard()} />
      {draft || onClear ? (
        <button
          type="button"
          data-find-clear
          aria-label="Clear"
          title="Clear"
          // Same rule as the paste key: taking focus would grow a collapsed
          // `overflowRight` well mid-click and slide the key out from under the pointer.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setDraft('');
            onClear?.();
            inputRef.current?.focus();
          }}
          className={cn(
            'ds-raw-button grid size-6 shrink-0 place-content-center text-text-faint hover:bg-surface-card hover:text-text-default active:translate-y-px',
            SIDEBAR_CONTROL_CORNER,
            focusRing('control', 'accent'),
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
      {panel ? (
        <div
          data-find-panel
          // Keep focus in the field: the panel is part of it, not a new stop.
          onPointerDown={(event) => event.preventDefault()}
          className={cn(
            'absolute inset-x-0 top-full z-50 mt-1 flex flex-col gap-1 bg-surface-card p-1 shadow-lg ring-1 ring-inset ring-border-hairline',
            SIDEBAR_CONTROL_CORNER,
          )}
        >
          {below}
          {escalate ? (
            <button
              type="button"
              data-find-escalate
              aria-label={`Search everywhere for “${query}”`}
              onClick={() => escalate(query)}
              className={cn(
                'ds-raw-button flex h-7 min-w-0 items-center gap-1.5 px-1.5 text-left text-role-caption text-text-default hover:bg-surface-sunken active:translate-y-px',
                SIDEBAR_CONTROL_CORNER,
              )}
            >
              <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
                {chordKeys('mod+↵', apple).map((key) => (
                  <KeyboardKey key={key} size="xs">
                    {key}
                  </KeyboardKey>
                ))}
              </span>
              <span className="shrink-0">Search everywhere for</span>
              <span className="min-w-0 flex-1 truncate font-semibold">“{query}”</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  // The slot holds the layout's 32px; the well may leave it to the right.
  return overflowRight ? (
    <div data-find-slot className="relative h-8 w-full min-w-0 shrink-0">
      {well}
    </div>
  ) : (
    well
  );
}

/** The phrases a list's Find rolls: rest "Find", the list's own "Find …", then what a paste does. */
export function findHints(label: string): readonly string[] {
  return ['Find', label, 'Paste to find'];
}

/**
 * The find well — FindField's and the everywhere face's (NavFind with no page
 * list: the page map, the header while the sidebar is closed). A fixed 32px.
 *
 * Depth lives ONLY at the rim (operator 2026-09-27): the inner edges gray
 * into the well while the middle stays white, so black words sit on white
 * and read at a glance. At rest it is a soft, pointer-cursor target that
 * invites the click ({@link SEARCH_WELL_CORNER}); pressed or focused it firms
 * up — tighter corner, darker rim.
 */
export function findWellClass(size: keyof typeof FIELD_SIZE = 'sidebar'): string {
  // The rim is mixed from the well's own ink (`text-text-default` →
  // currentColor), so it shades inward in light, dark and every palette theme.
  return cn(
    'flex h-8 w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 bg-surface-card text-text-default',
    'shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_12%,transparent),inset_0_1px_2px_color-mix(in_oklab,currentColor_9%,transparent),inset_0_0_10px_color-mix(in_oklab,currentColor_7%,transparent)]',
    'hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_24%,transparent),inset_0_1px_2px_color-mix(in_oklab,currentColor_9%,transparent),inset_0_0_10px_color-mix(in_oklab,currentColor_8%,transparent)]',
    'focus-within:cursor-text focus-within:shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,currentColor_60%,transparent),inset_0_1px_2px_color-mix(in_oklab,currentColor_7%,transparent)]',
    SEARCH_WELL_CORNER,
    FIELD_SIZE[size].well,
  );
}

/** Hint ink: dark enough to read at rest, full black while the operator looks at the well (hover / focus). */
export function findHintTone(active: boolean): string {
  return cn('transition-colors duration-150', active ? 'text-text-default' : 'text-text-muted');
}

/**
 * A well's hotkey, disclosed progressively: no room and no ink at rest,
 * slides open while the operator looks at the well. HOTKEY FIRST — it sits
 * between the glyph and the words. The negative margin cancels the well's
 * gap so the words do not start indented at rest.
 */
export function HoverKeycaps({ keys, shown }: { keys: readonly string[]; shown: boolean }) {
  return (
    <span
      aria-hidden
      data-hover-keycaps={shown ? 'shown' : 'hidden'}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,margin] duration-150',
        shown ? 'mr-0 max-w-24 opacity-100' : '-mr-1.5 max-w-0 opacity-0',
      )}
    >
      {keys.map((key) => (
        <KeyboardKey key={key} size="xs">
          {key}
        </KeyboardKey>
      ))}
    </span>
  );
}

/**
 * The well's paste key, just left of the clear key (far right when there is
 * nothing to clear) — shown while the operator looks at the well. Still in
 * the tab order: focusing it is looking, so it shows.
 */
export function PasteKey({ label, shown, onPaste }: { label: string; shown: boolean; onPaste: () => void }) {
  return (
    <button
      type="button"
      data-find-paste
      aria-label={label}
      title={label}
      onClick={onPaste}
      // Keep focus where it is: focusing the key would grow a `overflowRight`
      // well mid-click and slide the key out from under the pointer.
      onPointerDown={(event) => event.preventDefault()}
      // Hidden at rest it takes no room (like `HoverKeycaps`): the narrow
      // sidebar well keeps its words, and the clear key stays far right.
      className={cn(
        'ds-raw-button grid h-6 shrink-0 place-content-center overflow-hidden text-text-faint transition-[width,margin,color,background-color,transform,opacity]',
        'hover:bg-surface-card hover:text-text-default active:translate-y-px',
        shown ? 'ml-0 w-6 opacity-100' : 'pointer-events-none -ml-1.5 w-0 opacity-0',
        SIDEBAR_CONTROL_CORNER,
        focusRing('control', 'accent'),
      )}
    >
      <ClipboardPaste aria-hidden className="size-3.5" />
    </button>
  );
}
