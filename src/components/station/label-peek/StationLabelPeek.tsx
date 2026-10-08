'use client';

/**
 * Station label peek — the printed label is not an inline band on Unbox or
 * Quality control (operator 2026-10-08). A labelled **Label** button sits
 * above the composer's top-left, and the label springs up from it:
 *
 * - the button pins the preview open at any time — before any edit, with no
 *   serial, in Ticket mode, while the FNSKU dropdown is open; pressing it
 *   again closes it;
 * - every edit (`signal` changes: a note keystroke, a grade, a label kind)
 *   shows it, and it hides 4 s after the last edit;
 * - while the pointer or focus is inside it, it stays (inline slot edits as
 *   the last stitch);
 * - the X at the panel's top-right, Esc, and a click off unpin and close it.
 *
 * Top-left of the composer because that is where the operator is typing: the
 * label grows right above the words that print on it, and never covers the
 * Pass CTA at the bottom-right. The panel is anchored to the button, so the
 * button and the X never move it while it animates. Mount in the row above
 * the composer (`LineNotesCard`'s `labelPeek` slot); key it by the open record
 * so a record change is a fresh baseline, not an edit.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Tag, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton, Panel } from '@/design-system/primitives';
import { AnimatePresence, motion } from '@/design-system/motion';
import { chipLabel } from '@/design-system/tokens/typography/presets';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';

/** Idle time after the last edit before an unpinned peek hides. */
export const LABEL_PEEK_IDLE_MS = 4000;

export function StationLabelPeek({
  signal,
  children,
  testId = 'station-label-peek',
}: {
  /** Any value that changes on an edit the label shows. */
  signal: string;
  /** The label preview; `reveal` lets it ask to be shown (an editor opening, notes arriving). */
  children: (api: { reveal: () => void }) => ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const holdRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const baselineRef = useRef(signal);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (!holdRef.current) setOpen(false);
    }, LABEL_PEEK_IDLE_MS);
  }, []);

  const reveal = useCallback(() => {
    setOpen(true);
    scheduleHide();
  }, [scheduleHide]);

  const close = useCallback(() => {
    window.clearTimeout(timerRef.current);
    holdRef.current = false;
    setPinned(false);
    setOpen(false);
  }, []);

  // An edit — a signal that differs from the mount baseline — shows the label.
  useEffect(() => {
    if (signal === baselineRef.current) return;
    baselineRef.current = signal;
    reveal();
  }, [signal, reveal]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const visible = open || pinned;

  // Capture phase: a station ancestor's React onKeyDown that stops Escape
  // (React's stopPropagation stops the native event at the root) must not
  // strand the peek open. An overlay that claims the keyboard — a label editor
  // opened from inside the peek, the FNSKU dropdown — takes Esc first.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !hasOpenOverlay()) close();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [visible, close]);

  // A click off closes it, pinned or not. Inside the button / panel stays; a
  // portaled layer opened from the panel (label editor, slot menu) claims the
  // overlay stack, so a click on it is not a click off.
  const anchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible) return;
    const onPointerDown = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      if (hasOpenOverlay()) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [visible, close]);

  const hold = (on: boolean) => {
    holdRef.current = on;
    if (!on) scheduleHide();
  };

  return (
    <div ref={anchorRef} className="relative shrink-0" data-testid={`${testId}-anchor`}>
      <HoverTooltip label={visible ? 'Hide the label preview' : 'Preview the label'} asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-3xl"
          icon={<Tag className="h-3.5 w-3.5" aria-hidden />}
          aria-pressed={visible}
          aria-expanded={visible}
          onClick={() => (visible ? close() : setPinned(true))}
          data-testid={`${testId}-button`}
        >
          Label
        </Button>
      </HoverTooltip>
      <AnimatePresence>
        {visible ? (
          <motion.div
            key="label-peek"
            initial={{ opacity: 0, scale: 0.6, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
            className="absolute bottom-full left-0 z-raised mb-1.5 origin-bottom-left"
            onPointerEnter={() => hold(true)}
            onPointerLeave={() => hold(false)}
            onFocusCapture={() => hold(true)}
            onBlurCapture={() => hold(false)}
            data-testid={testId}
          >
            <Panel padding="none" radius="xl" elevation="overlay" className="w-[380px] max-w-[min(80vw,380px)] overflow-hidden p-2">
              <div className="flex items-center justify-between gap-2 pb-1.5 pl-1">
                <span className={cn(chipLabel, 'text-text-muted')}>Label preview</span>
                <IconButton
                  icon={<X className="h-4 w-4" />}
                  ariaLabel="Close label preview"
                  size="sm"
                  onClick={close}
                  data-testid={`${testId}-close`}
                />
              </div>
              {children({ reveal })}
            </Panel>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
