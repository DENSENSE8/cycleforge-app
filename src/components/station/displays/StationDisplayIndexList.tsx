'use client';

/**
 * Station Displays Root Index — grouped status rows (drill-down navigator).
 *
 * Icons resolve from the leaf {@link SectionTab} registry (one glyph SoT).
 * Tone chips replace the far-right orphaned dot; action rows wash lightly.
 * Eyebrow trailing = an action count, or nothing. Rows are read-only navigation:
 * the row holds NO control but itself (see the row-anatomy law below).
 *
 * Character-select: ↑↓ wrap via {@link useArmedCursorList}; armed face =
 * leading `>` + bottom accent track + marker pulse — no left rail / row wash.
 * Enter/Space/click opens the leaf in the **same turn** (never a hit-marker
 * DOM withhold). Footer `Filter displays…` drives the same cursor via
 * {@link StationDisplayIndexFilterKeys} (↑↓ without stealing focus; Enter
 * opens; Esc clears the query). Idle rows stay flush; tone chip stays a
 * trailing sibling. No Tab trap, no bare digits (wedge-safe). No UI audio.
 */

import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useReducedMotion } from '@/design-system/motion';
import type { SectionTab } from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { STATION_SECONDARY_BAND_FACE } from '@/components/layout/header-shell';
import { ChevronRight } from '@/components/Icons';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import {
  matchNavKey,
  NAV_KEY_HINT_CLASS,
  useNavRegion,
} from '@/lib/keyboard/nav-keys';
import { useKeyboardRegionOwner } from '@/lib/keyboard/useKeyboardRegionOwner';
import { cn } from '@/utils/_cn';
import {
  ARMED_CURSOR_CHEVRON_CLASS,
  ARMED_CURSOR_CHIP_FACE_CLASS,
  ARMED_CURSOR_MARKER_PULSE_CLASS,
  ARMED_CURSOR_TRACK_CLASS,
} from './armed-cursor-face';
import {
  DISPLAY_LEAF_NAV_KEY,
  groupDisplayIndexRows,
  summarizeDisplayIndexGroup,
  type DisplayIndexRow,
  type DisplayIndexTone,
} from './display-index';
import { useArmedCursorList } from './useArmedCursorList';

/**
 * Imperative bridge for the footer {@link TechRailSearchBar} — ↑↓/Enter/Esc
 * from the box without lifting cursor state into PushStack.
 */
export type StationDisplayIndexFilterKeys = {
  onFilterKeyDown: (e: ReactKeyboardEvent) => void;
};

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

const SUMMARY_TONE: Record<DisplayIndexTone, string> = {
  action: 'text-amber-700',
  ok: 'text-emerald-700',
  neutral: 'text-text-faint',
};

export const StationDisplayIndexList = forwardRef<
  StationDisplayIndexFilterKeys,
  {
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
  }
>(function StationDisplayIndexList(
  {
    rows,
    tabs,
    onSelect,
    activeId = null,
    filterQuery = '',
    onClearFilter,
  },
  filterKeysRef,
) {
  const reduce = useReducedMotion();
  const markerPulse = reduce ? undefined : ARMED_CURSOR_MARKER_PULSE_CLASS;
  const sections = useMemo(() => groupDisplayIndexRows(rows), [rows]);
  const trimmedQuery = filterQuery.trim();
  const iconById = new Map(tabs.map((t) => [t.id, t.icon]));
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const listId = useId();

  // Flattened visual order — groups render Verification → Assets → Context, so
  // the absolute cursor walks the same order the eye reads.
  const orderedIds = useMemo(
    () => sections.flatMap((s) => s.rows.map((r) => r.id)),
    [sections],
  );

  // Reveal-on-arm: keycaps show while the list is focused (the honest arm when
  // the operator is already in the list) OR while the leader armed this region
  // (⌘; → r) — and vanish otherwise. Zero permanent per-row chrome.
  const [focusWithin, setFocusWithin] = useState(false);
  const { isOwner: isKeyboardRegion } = useKeyboardRegionOwner();
  const rightOwnsKeyboard = isKeyboardRegion('right');

  const {
    cursorId,
    setCursorId,
    commitArmed,
    handleNavKeyDown,
    handleFilterNavKeyDown,
  } = useArmedCursorList({
    orderedIds,
    activeId,
    rootRef,
    rowRefs,
    regionActive: rightOwnsKeyboard,
  });

  // Nav-keys (Right region). One keymap drives both the revealed keycaps and the
  // store's leader-armed letter match, resolved from the co-located
  // DISPLAY_LEAF_NAV_KEY declarations. Letters jump + commit the same targets ↑↓
  // reach — they coexist, and both go through the shipped hit-marker commit.
  const rightTargets = useMemo(
    () => orderedIds.map((id) => ({ id, preferredKey: DISPLAY_LEAF_NAV_KEY[id] })),
    [orderedIds],
  );
  const { armed: regionArmed, keymap: navKeymap } = useNavRegion({
    id: 'right',
    targets: rightTargets,
    onCommit: (targetId) => commitArmed(targetId, onSelect),
  });
  const revealed = focusWithin || regionArmed;

  const onFilterKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      // Esc with a live query clears first (MasterNav comment contract) — do
      // not let the stack Esc close Displays while the operator is refining.
      if (e.key === 'Escape' && trimmedQuery) {
        e.preventDefault();
        e.stopPropagation();
        onClearFilter?.();
        return;
      }

      if (handleFilterNavKeyDown(e)) return;

      if (e.key === 'Enter') {
        if (orderedIds.length === 0) return;
        const id =
          (cursorId && orderedIds.includes(cursorId) ? cursorId : null) ??
          orderedIds[0] ??
          null;
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        commitArmed(id, onSelect);
        onClearFilter?.();
      }
    },
    [
      commitArmed,
      cursorId,
      handleFilterNavKeyDown,
      onClearFilter,
      onSelect,
      orderedIds,
      trimmedQuery,
    ],
  );

  useImperativeHandle(
    filterKeysRef,
    () => ({ onFilterKeyDown }),
    [onFilterKeyDown],
  );

  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        commitArmed(id, onSelect);
        return;
      }

      // The list OWNS Arrow / Home / End while a row is focused. Consuming them
      // here — plus the `data-list-key-owner` marker on the root, which the
      // ambient window keyboards (`useRecordCursorKeyboard`,
      // `useReceivingLineNavigation`) yield to — keeps ↑/↓ walking these rows
      // instead of leaking out to step the carton table + pop its peek.
      if (handleNavKeyDown(e, id)) return;

      // Letter jump (nav-keys) — a bare single letter matching a live row's
      // nav key commits that row, the same as ↑↓-then-Enter. Modifier combos
      // pass through (browser / ⌘ chords stay owned); an unmapped letter is NOT
      // consumed so it never swallows a keystroke — that no-op is how the
      // leader-armed mode will exit in P1. Digits are never matched (wedge law).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const targetId = matchNavKey(e.key, navKeymap);
      if (targetId) {
        e.preventDefault();
        e.stopPropagation();
        commitArmed(targetId, onSelect);
      }
    },
    [commitArmed, handleNavKeyDown, navKeymap, onSelect],
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
      // Focus-within is one of two arm sources (the leader is the other);
      // moving between rows keeps focus inside, so hints don't flicker.
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
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
            className="pt-4 first:pt-0"
            data-display-index-group={section.group}
          >
            {/* Eyebrow is LABEL ……… action count, and nothing else. A per-group
                Collapse button put the word COLLAPSE on screen three times over
                ten rows — chrome repeated per group is paid for N times and read
                once — and a `kbd` chip advertised a Digit1–3 chord that only
                fired after the operator had already tabbed into the list, which
                is a false shortcut hint (worse than no hint). Both deleted; bare
                digits cannot be safely bound on a bench where a wedge scan types
                digits into the page.
                Height = {@link STATION_SECONDARY_BAND_FACE} — same h-6 seam as
                left-rail eyebrow + carton commerce row 2. First group is flush
                under the Displays top band (first:pt-0). */}
            <div
              className={cn(
                'flex items-center gap-2 px-4',
                STATION_SECONDARY_BAND_FACE,
              )}
            >
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
                const navKey = navKeymap.get(row.id);
                const showChip = Boolean(chipText);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) rowRefs.current.set(row.id, el);
                        else rowRefs.current.delete(row.id);
                      }}
                      onClick={() => {
                        commitArmed(row.id, onSelect);
                      }}
                      onFocus={() => setCursorId(row.id)}
                      onKeyDown={(e) => onRowKeyDown(e, row.id)}
                      className={cn(
                        // 44px hit: py-3 + h-5 icon. Measured at 40px when this
                        // briefly ran py-2.5 — under the bench floor, so the
                        // density stays and "immediate" is bought with binary-
                        // cut arm + type roles (not pad shrink).
                        'group/row ds-raw-button relative flex w-full items-center gap-2 py-3 pl-3 pr-3 text-left',
                        'hover:bg-surface-hover',
                        // Armed face = `>` + bottom track. Suppress control
                        // focusRing while armed — ring-2 + ring-offset paints
                        // blue top/bottom bands that read as a second selection.
                        // ds-allow-focus
                        isArmed
                          ? 'outline-none'
                          : focusRing('control', 'accent'),
                        cornerClass('flush'),
                        TONE_ROW_WASH[row.tone],
                      )}
                      data-testid={`station-displays-index-${row.id}`}
                      data-tone={row.tone}
                      data-active={isArmed ? 'true' : undefined}
                      data-display-index-cursor={isArmed ? 'true' : undefined}
                      aria-current={isArmed ? 'true' : undefined}
                      aria-keyshortcuts={navKey ? navKey.toUpperCase() : undefined}
                    >
                      {/* Arm highlight is INSTANT — chevron + bottom track.
                          No layoutId FLIP (that was sliding the bar). */}
                      {isArmed ? (
                        <span
                          className={cn(ARMED_CURSOR_TRACK_CLASS, markerPulse)}
                          aria-hidden
                          data-display-index-armed-marker=""
                          data-display-index-armed-track=""
                        />
                      ) : null}
                      {/* Lead — idle flush leftmost; `>` mounts only when armed
                          (never an empty reserved gutter on peers). */}
                      <span
                        className="relative z-raised flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
                        data-display-index-content-nudge=""
                      >
                        {isArmed ? (
                          <span data-display-index-armed-chevron="" aria-hidden>
                            <ChevronRight
                              className={cn(
                                ARMED_CURSOR_CHEVRON_CLASS,
                                markerPulse,
                              )}
                            />
                          </span>
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
                      </span>
                      {showChip ? (
                        <span
                          className={cn(
                            'relative z-raised max-w-[45%]',
                            ARMED_CURSOR_CHIP_FACE_CLASS,
                            TONE_CHIP[row.tone],
                          )}
                          data-display-index-tone-chip=""
                        >
                          {chipText}
                        </span>
                      ) : null}
                      {/* Reveal-on-arm keycap — the row's stable nav-key letter,
                          shown only while the list is armed (focus-within) and
                          gone on disarm. A decorative sibling (never a control):
                          the letter fires through the button's own onKeyDown.
                          Trailing so it never touches the leading marker / nudge
                          track. */}
                      {revealed && navKey ? (
                        <span
                          className={cn(NAV_KEY_HINT_CLASS, 'relative z-raised')}
                          data-display-index-nav-key=""
                          aria-hidden
                        >
                          {navKey}
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
});

StationDisplayIndexList.displayName = 'StationDisplayIndexList';
