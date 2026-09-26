'use client';

/**
 * The mobile station layout — a tape that stacks upward into a fixed focus position, a header, and a capture window anchored to the bottom.
 * gone (operator 2026-09-05): it restated the page title one line under the
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
  /** Verbs offered per entry, or null where none apply. */
  itemActions,
  /** The record an entry opens on tap, or null. */
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

  // Oldest at the top:
  const older = useMemo(() => tape.slice(1).reverse(), [tape]);

  // Anchor on the HEAD entry, not on length:
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
          // Flush: the rows carry their own dividers, so a gap here would turn the ledger back into a stack of cards.
          <div className="flex flex-col pt-16">
            <AnimatePresence initial={false}>
              {older.map((entry) => (
                <motion.div
                  key={entry.id}
                  // No `layout`. Rows are only ever PREPENDED — the tape never reorders — but `layout` made Framer measure every visible row on each commit,…
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

            {/* The live region is this STABLE wrapper, not the keyed card inside it. */}
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
