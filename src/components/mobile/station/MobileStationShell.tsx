'use client';

/**
 * The mobile station layout — a tape that stacks upward into a fixed focus
 * position, a header, and a capture window anchored to the bottom.
 *
 *   ┌─────────────────────┐
 *   │  tape — older rows  │  scrolls, anchored to its BOTTOM edge
 *   │  ↑ pushed upward ↑  │
 *   │  [ focus item ]     │  the thing that just happened, at mid-screen
 *   ╰─────────────────────╮  ← the sheet's lip, flush against the tape
 *   │  CAPTURE SHEET      │  its own state line lives INSIDE it
 *   └─────────────────────┘
 *
 * ## Why the list grows upward
 *
 * The newest fact is the only one the operator is looking at, and it must never
 * move. A top-anchored feed puts the fresh row where the thumb is not and shifts
 * everything the instant the next one lands. Anchoring the stack to the window
 * means the focus item holds the same pixel all shift and history slides away
 * from it.
 *
 * This is the part worth propagating, and it is also the part a clone gets
 * wrong: the `min-h-0` chain, the `justify-end` container, the bottom-anchor
 * effect and the newest-first-to-oldest-first reversal are four coupled details
 * that look optional individually. They live here so no station reimplements
 * them.
 *
 * ## No header band
 *
 * There was a title + count row between the focus item and the sheet. It is
 * gone (operator 2026-09-05): it restated the page title one line under the
 * page title, and it opened a gap exactly where the tape should meet the
 * sheet's lip. The station's own state line belongs INSIDE its capture surface,
 * where the operator is already looking.
 *
 * ## What a station supplies
 *
 * A tape and a capture surface. Nothing in this file knows what a scan is.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { useModeFeedbackSeconds } from '@/design-system/providers/useModeFeedback';
import { MobileStationTapeItem } from './MobileStationTapeItem';
import type { StationItemAction, StationTapeEntry } from './station-tape';

/**
 * How often relative stamps re-render. Minute-grained readouts need no faster,
 * and this runs beside a continuous camera decode loop.
 */
const CLOCK_TICK_MS = 30_000;

export function MobileStationShell({
  tape,
  /**
   * Verbs offered per entry, or null where none apply.
   *
   * MUST return a STABLE array per entry — memoize it on the station side. It
   * is called for every visible row on every render, and the row is `memo`ized,
   * so a fresh array each call defeats that memo and re-renders the whole tape
   * on the 30s clock tick.
   */
  itemActions,
  /**
   * The record an entry opens on tap, or null. For stations whose decisions
   * live on the entity's own screen (arrival triage → the carton hub): a tap
   * navigates instead of disclosing verbs. Ignored for an entry that has
   * `itemActions`. Same STABLE-per-entry contract as `itemActions`.
   */
  itemOpen,
  /** Line 1 for an entry with no name. The station's own word. */
  untitledLabel,
  /** Shown in place of the tape before anything has happened. */
  empty,
  /** The capture surface. Anchored to the bottom, owns its own height. */
  window: captureWindow,
}: {
  tape: readonly StationTapeEntry[];
  itemActions?: (entry: StationTapeEntry) => readonly StationItemAction[] | null;
  itemOpen?: (entry: StationTapeEntry) => (() => void) | null;
  untitledLabel?: string;
  empty?: React.ReactNode;
  window: React.ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  // The region's state-change duration (triage ≤120ms; 0 under reduced motion).
  const feedback = useModeFeedbackSeconds();
  const tapeRef = useRef<HTMLDivElement | null>(null);

  // Relative stamps have to age on their own or the tape reads "just now" for
  // the whole shift. Paused while the tab is hidden: nobody is reading them, and
  // the tick re-renders the tape.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id == null) id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    const sync = () => {
      const hidden = document.visibilityState === 'hidden';
      // Drives the CSS that parks the title sweep — a main-thread repaint that
      // browsers only throttle, never stop, in a background tab.
      document.documentElement.dataset.stationHidden = String(hidden);
      if (hidden) stop();
      else {
        setNow(Date.now());
        start();
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stop();
      delete document.documentElement.dataset.stationHidden;
    };
  }, []);

  const focus = tape[0];

  // Oldest at the top: the stack reads downward toward the window, so history
  // is reversed out of the newest-first model.
  //
  // Derived from `tape` itself rather than from a rest-spread. `const [focus,
  // ...history] = tape` allocates a fresh `history` array on every render, so a
  // memo keyed on it never compares equal and never actually memoizes.
  const older = useMemo(() => tape.slice(1).reverse(), [tape]);

  // Anchor on the HEAD entry, not on length: a re-read COLLAPSES onto the row it
  // already made, so the newest item can change while the length does not — and
  // a length-keyed effect would leave the tape scrolled off the bottom exactly
  // when the operator re-scanned something to check it.
  const headId = focus?.id;
  useEffect(() => {
    const el = tapeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [headId, tape.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      <div
        ref={tapeRef}
        className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto overscroll-contain"
      >
        {tape.length === 0 ? (
          empty
        ) : (
          // Flush: the rows carry their own dividers, so a gap here would turn
          // the ledger back into a stack of cards.
          //
          // `pt-16` is clearance for a floating page header. The tape is
          // bottom-anchored, so with a short list nothing reaches the top and
          // the padding costs nothing; once the list overflows, this is what
          // lets the oldest row scroll out from UNDER the bar instead of
          // stopping half-hidden behind it.
          <div className="flex flex-col pt-16">
            <AnimatePresence initial={false}>
              {older.map((entry) => (
                <motion.div
                  key={entry.id}
                  // No `layout`. Rows are only ever PREPENDED — the tape never
                  // reorders — but `layout` made Framer measure every visible
                  // row on each commit, and a commit happens on the 30s clock
                  // tick as well as on every scan. That is up to 39
                  // getBoundingClientRect calls a tick, on the same thread as
                  // the camera decode loop, to animate a reflow that cannot
                  // happen. The entrance fade below is the whole effect.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: feedback }}
                >
                  <MobileStationTapeItem
                    entry={entry}
                    now={now}
                    actions={itemActions?.(entry) ?? null}
                    onOpen={itemOpen?.(entry) ?? null}
                    untitledLabel={untitledLabel}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/*
              The live region is this STABLE wrapper, not the keyed card inside
              it. A region that is inserted at the same commit as its text is
              announced inconsistently — screen readers monitor regions that
              already existed. The card still remounts per entry (below) so the
              entrance replays on a re-read; the region it announces into
              outlives it.

              Polite, not assertive: this fires on every capture, and assertive
              would interrupt the reader mid-sentence each time. `aria-atomic`
              so the card is read as one fact rather than five changed fragments.
            */}
            <div role="status" aria-atomic="true">
              {focus && (
                <motion.div
                  // Keyed by the entry so a re-read of the SAME thing replays
                  // the entrance — the operator's proof the capture fired again.
                  key={focus.id}
                  // Opacity only (BRIEF §4 triage: a ≤120ms crossfade, no travel)
                  // — the focus position must not move under the operator's eye.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: feedback }}
                >
                  <MobileStationTapeItem
                    entry={focus}
                    now={now}
                    emphasis="focus"
                    actions={itemActions?.(focus) ?? null}
                    onOpen={itemOpen?.(focus) ?? null}
                    untitledLabel={untitledLabel}
                  />
                </motion.div>
              )}
            </div>
          </div>
        )}
      </div>

      {captureWindow}
    </div>
  );
}
