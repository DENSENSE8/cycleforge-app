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
 * resumes at the phrase after the last one shown. Keys are never painted in
 * the well: the field's `F`, ⌘K and the paste-a-list chord ride the caller's
 * hover key card (NavFind), the escalate / clear chords their tooltips.
 *
 * Two scopes, one field: typing narrows the list on screen; `escalate` hands
 * the same text to the palette ("Search everywhere", ⌘↵ / Ctrl+↵).
 *
 * A SCAN is never a find. A wedge-speed burst that lands here, ended by
 * Enter/Tab or by going idle, is taken back out of the field. The text goes
 * back to what it was, and the scan goes to the scan identification kernel
 * (`submitScan`, which opens its record's URL). The list is never narrowed
 * by a scan: the field holds its commit for a wedge's idle window, so a
 * burst never reaches `onChange`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { CollapseItem } from '@/design-system/components/Collapse';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SEARCH_WELL_CORNER, SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { ClipboardPaste, Search, X } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  FIND_FIELD_BURST_IDLE,
  appendFindFieldKey,
  findFieldBurstValue,
  type FindFieldBurst,
} from '@/lib/keyboard/find-field-scan';
import { WEDGE_IDLE_FLUSH_MS } from '@/lib/keyboard/wedge-scan-machine';
import { submitScan } from '@/lib/scan/scan-kernel';

/** Hover intent: a pointer just passing through never starts a roll (or the well's key card). */
export const HINT_INTENT_MS = 180;
/** Each phrase holds this long — the eye is already on it, short phrases read fast. */
const HINT_HOLD_MS = 1_800;
/** Soft top/bottom edges: the line rolls in and out THROUGH the field's edge, not past a hard clip. */
const HINT_EDGE_MASK =
  '[mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]';

/**
 * Hover-or-focus = "looking at it". Spread `bind` on the element that owns
 * the hint (focus is captured, so an inner input counts). `also` is a part of
 * the field portaled elsewhere in the DOM (its {@link FindPanel}): focus
 * moving into it is still looking.
 */
export function useHintActivity(also?: RefObject<HTMLElement | null>) {
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
        if (!focusStaysIn(event, also)) setFocused(false);
      },
    },
  };
}

/** A blur whose next focus is still inside the element (or its portaled part) — focus has not left the field. */
export function focusStaysIn(event: FocusEvent, also?: RefObject<HTMLElement | null>): boolean {
  const next = event.relatedTarget as Node | null;
  return event.currentTarget.contains(next) || Boolean(next && also?.current?.contains(next));
}

/**
 * The rolling phrase, absolutely filling its (relative) parent. `hints[0]` is
 * the rest face; `hints[1…]` roll while `active`.
 *
 * Motion: the whole phrase moves as ONE LINE — it drops in from above while
 * the outgoing phrase drops out below (critically damped spring, no
 * overshoot), both through a soft masked edge — so it reads in one glance,
 * never word by word. A hover shorter than the intent delay never rolls.
 * Reduced motion keeps the swap as a
 * plain fade (`useMotionPresence` strips the travel).
 */
export function RollingHint({
  hints,
  active,
  className,
}: {
  hints: readonly string[];
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
  const key = hints.join('|');
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
          {hint}
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
 * Search icon · `lead` (a held token) · field (rolling hint while empty) ·
 * paste key · clear (far right). The field keeps a local draft and commits
 * after `debounceMs`; a committed value coming back never overwrites keys
 * typed since.
 *
 * The well keeps its slot's width — it never grows over what sits beside it
 * (operator 2026-10-08: the sidebar's search stays inside the sidebar; the
 * sidebar's own resize sash is how it gets wider).
 *
 * A paste — ⌘V / Ctrl+V or the paste key — REPLACES the field's text
 * (operator 2026-10-08: paste over what is there), unless `interceptPaste`
 * takes it (a pasted list).
 *
 * The panel under the well ({@link FindPanel}) holds, top to bottom: `drop`
 * while `dropOpen` (what the caller holds — a pasted list), then, while it
 * has focus and text, `below` (the caller's answer, e.g. where the text
 * lives) and, with `escalate`, the "Search everywhere" row (⌘↵ / Ctrl+↵).
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
  lead,
  drop,
  dropOpen = false,
  keyShortcuts,
  onClear,
  panelRef: panelRefProp,
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
  /** A held token left of the text ({@link FindToken}, keyed) — enters and leaves with a blur. */
  lead?: ReactNode;
  /** Painted at the top of the panel while `dropOpen` (see above). */
  drop?: ReactNode;
  dropOpen?: boolean;
  /** More `aria-keyshortcuts` that land in this field (a chord the caller owns). */
  keyShortcuts?: string;
  /** The caller has something to clear beyond the text (see above). */
  onClear?: () => void;
  /** The portaled panel — pass one to tell focus moving into it from focus leaving the field. */
  panelRef?: RefObject<HTMLDivElement>;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  // The wedge-speed run being typed and the text it started from (see the file note: a scan is never a find).
  const burst = useRef<FindFieldBurst>(FIND_FIELD_BURST_IDLE);
  const beforeBurst = useRef(value);
  const ownPanelRef = useRef<HTMLDivElement>(null);
  const panelRef = panelRefProp ?? ownPanelRef;
  const wellRef = useRef<HTMLDivElement>(null);
  const look = useHintActivity(panelRef);
  /** The run was a scan: put the text back and hand the scan to the kernel. */
  const handOffScan = useCallback((): boolean => {
    const scan = findFieldBurstValue(burst.current);
    burst.current = FIND_FIELD_BURST_IDLE;
    if (!scan || !submitScan(scan)) return false;
    setDraft(beforeBurst.current);
    return true;
  }, []);
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === committed.current) return;
    // Never sooner than a wedge's idle window: a scan's characters must not narrow the list on the way in.
    const timer = window.setTimeout(() => {
      if (handOffScan()) return; // a wedge that ends without Enter idles out here
      committed.current = draft;
      onChange(draft);
    }, Math.max(debounceMs, WEDGE_IDLE_FLUSH_MS));
    return () => window.clearTimeout(timer);
  }, [draft, debounceMs, onChange, handOffScan]);

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
  // A field that also escalates teaches both jobs in one roll: find on this
  // page, then search everywhere.
  const rolled: readonly string[] = escalate
    ? [hints[0] ?? 'Find', hints[1] ?? 'Find', 'Search everywhere', ...hints.slice(2)]
    : hints;
  const query = look.focused ? draft.trim() : '';
  const held = Boolean(dropOpen && drop);
  const answered = Boolean(query && (below || escalate));
  // ↓ past the caller's rows lights "Search everywhere"; ↵ then runs it. Keyed to the text: a new text starts unlit.
  const [escalateLitFor, setEscalateLitFor] = useState<string | null>(null);
  const escalateLit = Boolean(answered && escalate && escalateLitFor === query);
  const shortcuts = [escalate ? 'F Meta+Enter Control+Enter' : 'F', keyShortcuts].filter(Boolean).join(' ');
  return (
    <div
      ref={wellRef}
      data-find-field
      onPointerEnter={look.bind.onPointerEnter}
      onPointerLeave={look.bind.onPointerLeave}
      onFocusCapture={look.bind.onFocusCapture}
      onBlurCapture={look.bind.onBlurCapture}
      className={cn(findWellClass(size), 'relative')}
    >
      <Search aria-hidden className="size-3.5 shrink-0 text-text-muted" />
      <FindLead>{lead}</FindLead>
      <span className="relative flex h-full min-w-0 flex-1">
        {draft ? null : <RollingHint hints={rolled} active={look.active} className={cn(sized.text, findHintTone(look.active))} />}
        <input
          ref={inputRef}
          type="search"
          value={draft}
          aria-label={label}
          aria-keyshortcuts={shortcuts}
          aria-haspopup={drop ? 'listbox' : undefined}
          aria-expanded={drop ? held : undefined}
          spellCheck={false}
          autoComplete="off"
          data-testid={testId}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            event.preventDefault();
            if (!text.trim() || interceptPaste?.(text)) return;
            setDraft(text.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Tab') {
              if (!event.metaKey && !event.ctrlKey && !event.altKey && handOffScan()) {
                event.preventDefault();
                return;
              }
            } else if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) {
              burst.current = FIND_FIELD_BURST_IDLE;
            } else {
              const next = appendFindFieldKey(burst.current, event.key, event.timeStamp || performance.now());
              if (next.buffer.length === 1) beforeBurst.current = draft;
              burst.current = next;
            }
            const plainKey = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
            if (escalateLit && escalate && plainKey && (event.key === 'ArrowUp' || event.key === 'Enter')) {
              event.preventDefault();
              if (event.key === 'Enter') escalate(query);
              else setEscalateLitFor(null);
              return;
            }
            onKeyDown?.(event, draft, () => setDraft(''));
            if (event.defaultPrevented) return;
            if (escalate && answered && plainKey && event.key === 'ArrowDown') {
              event.preventDefault();
              setEscalateLitFor(query);
              return;
            }
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
        <HoverTooltip asChild label="Clear" shortcut={escalate ? 'mod + Shift + F' : undefined}>
        <button
          type="button"
          data-find-clear
          aria-label="Clear"
          // Keep focus where it is: the click clears and lands in the field itself.
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
        </HoverTooltip>
      ) : null}
      <FindPanel open={held || answered} anchorRef={wellRef} panelRef={panelRef} onClose={() => inputRef.current?.blur()}>
        {held ? drop : null}
        {answered ? below : null}
        {answered && escalate ? (
          // The keys are painted, not hidden in a tooltip (operator 2026-10-08): ⌘↵ from the
          // field, or ↓ to light this row and ↵ to run it.
          <button
            type="button"
            data-find-escalate
            data-lit={escalateLit ? '' : undefined}
            aria-label={`Search everywhere for “${query}”`}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            onClick={() => escalate(query)}
            className={cn(
              'ds-raw-button flex h-7 min-w-0 shrink-0 items-center gap-1.5 px-1.5 text-left text-role-caption text-text-default hover:bg-surface-sunken active:translate-y-px',
              escalateLit && 'bg-surface-sunken',
              SIDEBAR_CONTROL_CORNER,
            )}
          >
            {/* Short words, so the text stays readable in the sidebar-wide panel; the aria-label says it all. */}
            <span className="shrink-0 text-text-muted">Everywhere</span>
            <span className="min-w-0 flex-1 truncate font-semibold">“{query}”</span>
            <KeyboardChord chord={escalateLit ? '↵' : 'mod + ↵'} size="xs" tone="default" />
          </button>
        ) : null}
      </FindPanel>
    </div>
  );
}

/** The well's held-token slot: a keyed {@link FindToken} enters and leaves with its blur (never on first paint). */
export function FindLead({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

/**
 * The panel hanging under a find well (FindField's, the everywhere face's).
 * It is PORTALED through the house {@link AnchoredLayer} at the
 * `panelPopover` band — never painted inside the well, where the sidebar
 * column's stacking context clipped it under the page (2026-10-04). Anchored
 * to the well's bottom-left and exactly as wide as the well, so it stays
 * inside the sidebar (a wider sidebar — its resize sash — is a wider panel);
 * it flips / clamps to the viewport and caps its height to the room it has,
 * scrolling inside. Its height opens and closes through the
 * house `CollapseItem` on ease-in-out tweens (`motionTransition.findListPanelOpen`
 * / `findListPanelClose` — the close faster); reduced motion keeps it a plain swap. Pointer presses keep focus
 * where it is — the panel is part of the field, not a new tab stop — and a
 * press outside the panel and the well calls `onClose`.
 */
export function FindPanel({
  open,
  anchorRef,
  panelRef,
  onClose,
  children,
}: {
  open: boolean;
  /** The well the panel hangs from. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The panel element — focus inside it still belongs to the field ({@link focusStaysIn}). */
  panelRef?: RefObject<HTMLDivElement>;
  onClose: () => void;
  children: ReactNode;
}) {
  const opening = useMotionTransition(motionTransition.findListPanelOpen);
  const closing = useMotionTransition(motionTransition.findListPanelClose);
  // The layer stays mounted until the close has played.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return (
    <AnchoredLayer
      open={mounted}
      restoreFocus={false}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      level="panelPopover"
      gap={4}
      matchWidth
      closeOnEscape={false}
    >
      <AnimatePresence onExitComplete={() => setMounted(false)}>
        {open ? (
          // Height through the house Collapse, on the well's ease-in-out timing (no spring).
          <CollapseItem key="find-panel" timing={{ open: opening, close: closing }}>
            <div
              ref={panelRef}
              data-find-panel
              onPointerDown={(event) => {
                // A row's own edit box still takes the pointer.
                if (!(event.target as HTMLElement).closest('input, textarea')) event.preventDefault();
              }}
              className={cn(
                'flex max-h-[min(34rem,var(--anchored-available-height,34rem))] cursor-default flex-col gap-1 overflow-hidden bg-surface-card p-1 font-spine shadow-lg ring-1 ring-inset ring-border-hairline',
                SIDEBAR_CONTROL_CORNER,
              )}
            >
              {children}
            </div>
          </CollapseItem>
        ) : null}
      </AnimatePresence>
    </AnchoredLayer>
  );
}

/**
 * A held thing inside the well, left of the text (a pasted list: `40
 * numbers`): pressing it opens what it holds, its own × lets it go. It
 * enters with a short blur-in and leaves the same way
 * (`motionPresence.findListToken`). Render it keyed, as FindField's `lead`.
 */
export function FindToken({
  children,
  label,
  clearLabel,
  onOpen,
  onExpand,
  onClear,
}: {
  children: ReactNode;
  /** Accessible name of the token's press (`Open the 40 pasted numbers`). */
  label: string;
  clearLabel: string;
  onOpen: () => void;
  /** ↵ on the focused token: what it holds, in full (the pasted list's page). Omit and ↵ presses like a click. */
  onExpand?: () => void;
  onClear: () => void;
}) {
  const presence = useMotionPresence(motionPresence.findListToken);
  const transition = useMotionTransition(motionTransition.findListToken);
  return (
    <motion.span
      data-find-token
      initial={presence.initial}
      animate={presence.animate}
      exit={presence.exit}
      transition={transition}
      className={cn(
        'inline-flex h-6 shrink-0 items-center bg-surface-sunken text-text-default ring-1 ring-inset ring-border-soft',
        SIDEBAR_CONTROL_CORNER,
      )}
    >
      <button
        type="button"
        aria-label={label}
        // Keep focus where it is: the press opens the panel and lands in the field.
        onPointerDown={(event) => event.preventDefault()}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !onExpand) return;
          event.preventDefault();
          onExpand();
        }}
        className={cn(
          'ds-raw-button inline-flex h-full items-center gap-1 whitespace-nowrap pl-1.5 pr-1 text-role-caption font-semibold tabular-nums hover:bg-surface-card active:translate-y-px',
          SIDEBAR_CONTROL_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        {children}
      </button>
      <button
        type="button"
        aria-label={clearLabel}
        title={clearLabel}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onClear}
        className={cn(
          'ds-raw-button grid size-5 shrink-0 place-content-center text-text-faint hover:bg-surface-card hover:text-text-default active:translate-y-px',
          SIDEBAR_CONTROL_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        <X aria-hidden className="size-3" />
      </button>
    </motion.span>
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
      // Keep focus where it is: the paste lands in the field, which takes focus itself.
      onPointerDown={(event) => event.preventDefault()}
      // Hidden at rest it takes no room: the narrow
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
