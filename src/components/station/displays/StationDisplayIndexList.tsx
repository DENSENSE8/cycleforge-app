'use client';

/**
 * Station Displays Root Index — grouped status rows (drill-down navigator).
 *
 * Icons resolve from the leaf {@link SectionTab} registry (one glyph SoT).
 * Tone chips replace the far-right orphaned dot; action rows wash lightly.
 * Eyebrow trailing = an action count, or nothing. Rows are read-only navigation:
 * the row holds NO control but itself (see the row-anatomy law below).
 *
 * Character-select keyboard: ↑↓ wrap an absolute cursor across the flattened
 * visual order; Enter/Space (and click) commit → open the leaf. The armed
 * marker FLIPs with the cursor. No Tab trap, no bare digits (wedge-safe).
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ChevronRight } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useReducedMotion,
} from '@/design-system/motion';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import type { SectionTab } from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { cn } from '@/utils/_cn';
import {
  groupDisplayIndexRows,
  summarizeDisplayIndexGroup,
  type DisplayIndexRow,
  type DisplayIndexTone,
} from './display-index';

const TONE_CHIP: Record<DisplayIndexTone, string> = {
  action: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  ok: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  neutral: 'bg-surface-sunken text-text-soft ring-1 ring-inset ring-border-hairline',
};

const TONE_ROW_WASH: Record<DisplayIndexTone, string | false> = {
  action: 'bg-amber-50/60',
  ok: false,
  neutral: false,
};

/** One shared marker across every row — framer FLIPs it between them. */
const ARMED_MARKER_LAYOUT_ID = 'station-displays-armed-marker';

/** One-shot settle wash duration — matches PoLineRow scan ack. */
const CURSOR_PULSE_MS = 400;

const SUMMARY_TONE: Record<DisplayIndexTone, string> = {
  action: 'text-amber-700',
  ok: 'text-emerald-700',
  neutral: 'text-text-faint',
};

function seedCursorId(
  orderedIds: readonly string[],
  activeId: string | null | undefined,
  prev: string | null,
): string | null {
  if (orderedIds.length === 0) return null;
  if (prev && orderedIds.includes(prev)) return prev;
  if (activeId && orderedIds.includes(activeId)) return activeId;
  return orderedIds[0] ?? null;
}

function isEditableOutsideList(
  el: EventTarget | null,
  root: HTMLElement | null,
): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (root?.contains(el)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

export function StationDisplayIndexList({
  rows,
  tabs,
  onSelect,
  activeId = null,
  filterQuery = '',
  onClearFilter,
}: {
  rows: DisplayIndexRow[];
  /** Leaf registry — icons paint from matching tab ids. */
  tabs: readonly SectionTab[];
  onSelect: (id: string) => void;
  /**
   * The footer filter's current text. Only used to tell the two empty states
   * apart — "this station has no displays" is a different answer from "your
   * filter excluded all of them", and showing the first when the second is true
   * tells the operator their displays are gone.
   */
  filterQuery?: string;
  /** Clears the footer filter from the no-match state. */
  onClearFilter?: () => void;
  /**
   * Last opened leaf id — seeds the character-select cursor when the index
   * mounts or when returning from a leaf. Distinct from `tone === 'action'`
   * amber wash (attention ≠ selection). Armed paint follows the cursor.
   */
  activeId?: string | null;
}) {
  const reduce = useReducedMotion();
  const { transition: armedTransition } = useMotionRole(motionRole.push.rail);
  const pulseTransition = useMotionTransition(motionRole.feedback.pulse.transition);
  const sections = useMemo(() => groupDisplayIndexRows(rows), [rows]);
  const trimmedQuery = filterQuery.trim();
  const iconById = new Map(tabs.map((t) => [t.id, t.icon]));
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const listId = useId();
  const prevActiveIdRef = useRef(activeId);
  const prevCursorForPulseRef = useRef<string | null>(null);
  const didMountFocusRef = useRef(false);

  // Flattened visual order — groups render Verification → Assets → Context, so
  // the absolute cursor walks the same order the eye reads.
  const orderedIds = useMemo(
    () => sections.flatMap((s) => s.rows.map((r) => r.id)),
    [sections],
  );

  const [cursorId, setCursorId] = useState<string | null>(() =>
    seedCursorId(orderedIds, activeId, null),
  );
  const [pulseToken, setPulseToken] = useState(0);

  // Keep cursor inside the filtered absolute order; reseed from activeId when
  // the operator returns from a leaf (activeId changes).
  useEffect(() => {
    const activeChanged = prevActiveIdRef.current !== activeId;
    prevActiveIdRef.current = activeId;

    setCursorId((prev) => {
      if (orderedIds.length === 0) return null;
      if (activeChanged && activeId && orderedIds.includes(activeId)) {
        return activeId;
      }
      return seedCursorId(orderedIds, activeId, prev);
    });
  }, [orderedIds, activeId]);

  // Autofocus the seeded row once when the index mounts with rows — Open
  // displays is immediately ↑↓-ready. Skip when focus sits in an editable
  // outside the list (footer filter, scan bar).
  useEffect(() => {
    if (didMountFocusRef.current) return;
    if (!cursorId || orderedIds.length === 0) return;
    if (isEditableOutsideList(document.activeElement, rootRef.current)) return;

    didMountFocusRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      rowRefs.current.get(cursorId)?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [cursorId, orderedIds.length]);

  // One-shot settle wash when the cursor moves (not on initial seed).
  useEffect(() => {
    const prev = prevCursorForPulseRef.current;
    prevCursorForPulseRef.current = cursorId;
    if (reduce || !cursorId || prev == null || prev === cursorId) return;
    setPulseToken((n) => n + 1);
  }, [cursorId, reduce]);

  useEffect(() => {
    if (pulseToken === 0) return;
    const token = pulseToken;
    const timer = window.setTimeout(() => {
      setPulseToken((n) => (n === token ? 0 : n));
    }, CURSOR_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [pulseToken]);

  const moveCursorTo = useCallback((nextId: string) => {
    setCursorId(nextId);
    rowRefs.current.get(nextId)?.focus();
  }, []);

  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setCursorId(id);
        onSelect(id);
        return;
      }

      // The list OWNS Arrow / Home / End while a row is focused. Consuming them
      // here — plus the `data-list-key-owner` marker on the root, which the
      // ambient window keyboards (`useRecordCursorKeyboard`,
      // `useReceivingLineNavigation`) yield to — keeps ↑/↓ walking these rows
      // instead of leaking out to step the carton table + pop its peek.
      // Character-select: ↑↓ wrap modulo the absolute flattened order.
      const key = e.key;
      if (
        key !== 'ArrowDown' &&
        key !== 'ArrowUp' &&
        key !== 'Home' &&
        key !== 'End'
      ) {
        return;
      }

      if (orderedIds.length === 0) return;

      const idx = orderedIds.indexOf(id);
      if (idx === -1) return;

      let nextIdx: number;
      if (key === 'Home') nextIdx = 0;
      else if (key === 'End') nextIdx = orderedIds.length - 1;
      else if (key === 'ArrowDown') nextIdx = (idx + 1) % orderedIds.length;
      else nextIdx = (idx - 1 + orderedIds.length) % orderedIds.length;

      const nextId = orderedIds[nextIdx];
      e.preventDefault();
      e.stopPropagation();
      if (nextId == null || nextId === id) return;
      moveCursorTo(nextId);
    },
    [moveCursorTo, onSelect, orderedIds],
  );

  return (
    // Not a listbox: these rows navigate (open a leaf) — they hold no persistent
    // selection, and the interactive element is the nested button. A listbox
    // role would promise arrow-key nav + aria-selected + a single tab stop that
    // this list does not implement; a plain list of Tab-focusable buttons is the
    // honest contract. The accessible name comes from the push column's region.
    <div
      ref={rootRef}
      data-testid="station-displays-index"
      data-station-displays-index=""
      {...{ [LIST_KEY_OWNER_ATTR]: '' }}
      tabIndex={-1}
      className="outline-none"
    >
      {sections.length === 0 ? (
        <div className="inset-empty text-center" data-testid="station-displays-index-empty">
          {trimmedQuery ? (
            <>
              <p className="text-role-caption text-text-soft">
                No displays match “{trimmedQuery}”.
              </p>
              {onClearFilter ? (
                <button
                  type="button"
                  onClick={onClearFilter}
                  className={cn(
                    'ds-raw-button mt-2 text-role-eyebrow font-semibold uppercase tracking-widest',
                    'text-accent-bg hover:text-text-default',
                    focusRing('control', 'accent'),
                    cornerClass('flush'),
                  )}
                  data-testid="station-displays-index-clear-filter"
                >
                  Clear filter
                </button>
              ) : null}
            </>
          ) : (
            <p className="text-role-caption text-text-soft">
              No displays for this record.
            </p>
          )}
        </div>
      ) : null}
      {sections.map((section) => {
        const summary = summarizeDisplayIndexGroup(section.rows);
        const headingId = `${listId}-${section.group}-heading`;
        return (
          <section
            key={section.group}
            className="pt-4 first:pt-2"
            data-display-index-group={section.group}
          >
            {/* Eyebrow is LABEL ……… action count, and nothing else. A per-group
                Collapse button put the word COLLAPSE on screen three times over
                ten rows — chrome repeated per group is paid for N times and read
                once — and a `kbd` chip advertised a Digit1–3 chord that only
                fired after the operator had already tabbed into the list, which
                is a false shortcut hint (worse than no hint). Both deleted; bare
                digits cannot be safely bound on a bench where a wedge scan types
                digits into the page. */}
            <div className="flex items-center gap-2 px-4 pb-1.5">
              <h3
                id={headingId}
                className="min-w-0 flex-1 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint"
              >
                {section.label}
              </h3>
              {summary.label ? (
                <span
                  className={cn(
                    'shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest',
                    SUMMARY_TONE[summary.tone],
                  )}
                  data-testid={`station-displays-index-summary-${section.group}`}
                  data-tone={summary.tone}
                >
                  {summary.label}
                </span>
              ) : null}
            </div>
            <ul
              aria-labelledby={headingId}
              className="divide-y divide-border-hairline border-y border-border-hairline"
            >
              {section.rows.map((row) => {
                const Icon = iconById.get(row.id);
                const chipText = row.subtitle.trim();
                const isArmed = cursorId != null && cursorId === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) rowRefs.current.set(row.id, el);
                        else rowRefs.current.delete(row.id);
                      }}
                      onClick={() => {
                        setCursorId(row.id);
                        onSelect(row.id);
                      }}
                      onFocus={() => setCursorId(row.id)}
                      onKeyDown={(e) => onRowKeyDown(e, row.id)}
                      className={cn(
                        // 44px hit: py-3 + h-5 icon. Measured at 40px when this
                        // briefly ran py-2.5 — under the bench floor, so the
                        // density stays and "immediate" is bought with the
                        // accent rail / pulse / tighter left gutter instead.
                        'group/row ds-raw-button relative flex w-full items-center gap-2 py-3 pl-3 pr-3 text-left',
                        // ARMED CHANNEL RAIL. The 2px accent edge is a border on
                        // the element itself (never `rounded-[inherit]` on a
                        // child), and it is ALWAYS present as `transparent` so
                        // arming a row changes ink, never geometry — the row
                        // must not shift 2px under an operator's cursor.
                        'border-l-2 border-transparent',
                        'hover:bg-surface-hover',
                        'focus-visible:bg-accent-bg/10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-bg/40',
                        isArmed && 'border-l-accent-bg bg-accent-bg/10',
                        focusRing('control', 'accent'),
                        cornerClass('flush'),
                        TONE_ROW_WASH[row.tone],
                      )}
                      data-testid={`station-displays-index-${row.id}`}
                      data-tone={row.tone}
                      data-active={isArmed ? 'true' : undefined}
                      data-display-index-cursor={isArmed ? 'true' : undefined}
                      aria-current={isArmed ? 'true' : undefined}
                    >
                      {/* One-shot settle wash — opacity only, terminates after
                          one play. Never a looping full-row glow. */}
                      <AnimatePresence>
                        {isArmed && pulseToken > 0 ? (
                          <motion.span
                            key={pulseToken}
                            aria-hidden
                            initial={{ opacity: 0.35 }}
                            animate={{ opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={pulseTransition}
                            className="pointer-events-none absolute inset-0 z-0 bg-accent-bg"
                            data-display-index-cursor-pulse=""
                          />
                        ) : null}
                      </AnimatePresence>
                      {/* TRAVELING ARMED MARKER — the selection itself moves.
                          Absolutely positioned, so icon + title stay flush
                          left and NOTHING reflows when a row arms; the old
                          in-flow gutter bought layout stability by pushing
                          every icon 16px right on every row forever.
                          `layoutId` is the sanctioned use of shared-element
                          continuity (motion law: one element that physically
                          travels) — framer FLIPs this chevron from the old row
                          to the new one, so the operator SEES what moved
                          rather than diffing two static states. Dropped under
                          reduced motion, where it cross-fades in place. */}
                      {isArmed ? (
                        <motion.span
                          layoutId={reduce ? undefined : ARMED_MARKER_LAYOUT_ID}
                          transition={armedTransition}
                          className="pointer-events-none absolute inset-y-0 left-0 z-raised flex w-7 items-center justify-center"
                          aria-hidden
                          data-display-index-armed-marker=""
                        >
                          <ChevronRight className="h-4 w-4 text-accent-bg motion-safe:animate-pulse" />
                        </motion.span>
                      ) : null}
                      {Icon ? (
                        <Icon
                          className="h-5 w-5 shrink-0 text-text-soft"
                          aria-hidden
                        />
                      ) : (
                        <span className="h-5 w-5 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                        {row.label}
                      </span>
                      {chipText ? (
                        <span
                          className={cn(
                            'max-w-[45%] shrink-0 truncate rounded-none px-1.5 py-0.5',
                            // tabular so 1/1 · 10 PHOTOS · 1 SERIAL align down
                            // the column — `role-eyebrow` does not bind it.
                            'text-role-eyebrow font-semibold uppercase tracking-widest tabular-nums',
                            TONE_CHIP[row.tone],
                          )}
                        >
                          {chipText}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
