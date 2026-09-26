'use client';

/** `DeskRecordPlane` — the ONE place a desk record is placed (operator 2026-09-25). */

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useMode } from '@/design-system/providers/ModeRegion';
import { cn } from '@/utils/_cn';
import {
  DESK_RECORD_ASIDE_COLUMN_CLASS,
  DESK_RECORD_COLUMNS_CLASS,
  DESK_RECORD_MAIN_COLUMN_CLASS,
  DESK_RECORD_MEASURE_CLASS,
  DESK_SPLIT_RECORD_CARD_CLASS,
  DESK_SPLIT_RECORD_CLASS,
} from '../tokens/desk-stage';
import { DeskRecordViewSwitch } from './DeskRecordViewSwitch';
import { useDeskStageOptional } from './DeskStageContext';
import { DeskStageOverlay, DeskStageRecordHeader, isRecordEscTextEntry } from './DeskStageOverlay';

type DeskRecordView = 'in-place' | 'split';

/** Which record view the enclosing desk stage selects. `in-place` outside a desk. */
export function useDeskRecordView(): DeskRecordView {
  return useDeskStageOptional()?.fullscreen ? 'split' : 'in-place';
}

/** Published around the list AND the record. */
interface DeskRecordPlaneState {
  open: boolean;
  view: DeskRecordView;
  ownsEscape: boolean;
}

const DeskRecordPlaneContext = createContext<DeskRecordPlaneState | null>(null);

export function useDeskRecordPlaneOptional(): DeskRecordPlaneState | null {
  return useContext(DeskRecordPlaneContext);
}

/** Attribute a list row carries so the plane can hand focus back to it on close. */
export const DESK_RECORD_KEY_ATTR = 'data-desk-record-key';

/**
 * Marks the list chrome that stays live over an in-place record — the search
 * row plus the record action strip under it. The record opens below its
 * bottom edge. A list with no anchor is covered from the top.
 */
export const DESK_RECORD_ANCHOR_ATTR = 'data-desk-record-anchor';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Record body: the container the record's own layout queries. */
const RECORD_BODY_CLASS = '@container flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain';

interface DeskRecordPlaneProps {
  /** A record is open. */
  open: boolean;
  /** Close the record — strip the surface's deep-link param. */
  onClose: () => void;
  /** Header title and the record region's accessible name. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Walk position, e.g. `2 of 28`. */
  indexLabel?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** The fixed-width list — mounted once, never remounted between views. */
  list: ReactNode;
  /** The open record's view. The same component in both views. */
  children: ReactNode;
  /**
   * Split view with nothing open: the list read as a whole (queue totals, "on
   * the way"). Defaults to a one-line "Select a record". In place, the same
   * summary belongs on the list's toolbar — the surface puts it there.
   */
  summary?: ReactNode;
  /** Noun for the empty split pane (`Select an order`). */
  recordNoun?: string;
  footer?: ReactNode;
  /** The record's own verbs, in the header band of both views (before n of N / ‹ › / ✕). */
  actions?: ReactNode;
  /** Open record's key — matched against {@link DESK_RECORD_KEY_ATTR} for focus return. */
  recordKey?: string | null;
  /** On the record container in both views; `data-desk-record-view` says which. */
  testId?: string;
  className?: string;
}

export function DeskRecordPlane({
  open,
  onClose,
  title,
  subtitle,
  indexLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  list,
  children,
  summary,
  recordNoun = 'record',
  footer,
  actions,
  recordKey = null,
  testId = 'desk-record-plane',
  className,
}: DeskRecordPlaneProps) {
  const view = useDeskRecordView();
  const split = view === 'split';
  const listRef = useRef<HTMLDivElement>(null);

  // Motion: the split pane springs in beside the list; the record body swaps
  // (J/K, a clicked row) on the focus crossfade — enter only, so a walk never
  // waits on an exit. Industrial regions move nothing (BRIEF §12).
  const still = useMode() === 'industrial';
  const pane = useMotionRole(motionRole.record.pane);
  const swap = useMotionRole(motionRole.swap.focus);
  const paneTransition = still ? { duration: 0 } : pane.transition;
  const swapTransition = still ? { duration: 0 } : swap.transition;
  const swapKey = recordKey ?? (typeof title === 'string' ? title : 'record');

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Split: the first Esc closes the record.
  useEffect(() => {
    if (!split || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      event.preventDefault();
      if (isRecordEscTextEntry(event.target)) {
        (event.target as HTMLElement).blur();
        return;
      }
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [split, open]);

  // Focus return: remember the open record (it moves with J/K) and the element
  // focused when it opened; on close, focus that record's row in the list.
  const returnRef = useRef<{ key: string | null; fallback: HTMLElement | null } | null>(null);
  useEffect(() => {
    if (open) {
      if (returnRef.current) returnRef.current.key = recordKey;
      else {
        const active = document.activeElement;
        returnRef.current = {
          key: recordKey,
          fallback: active instanceof HTMLElement ? active : null,
        };
      }
      return;
    }
    const ret = returnRef.current;
    returnRef.current = null;
    const host = listRef.current;
    if (!ret || !host) return;
    const row =
      ret.key == null
        ? null
        : host.querySelector<HTMLElement>(`[${DESK_RECORD_KEY_ATTR}="${CSS.escape(ret.key)}"]`);
    const target =
      (row && (row.matches(FOCUSABLE) ? row : row.querySelector<HTMLElement>(FOCUSABLE))) ??
      (ret.fallback?.isConnected && host.contains(ret.fallback) ? ret.fallback : null);
    target?.focus({ preventScroll: true });
  }, [open, recordKey]);

  // In place the list is covered, so focus follows the record: a row left
  // focused under the stage would keep taking keys (arrows, the row's Esc) for
  // a list the staffer cannot see. Runs after the focus-return capture above.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || split) return;
    bodyRef.current?.focus({ preventScroll: true });
  }, [open, split]);

  // The in-place record's top edge: the bottom of the list's anchor (search
  // row + action strip), re-measured as the strip arms, morphs and disarms.
  const [overlayTop, setOverlayTop] = useState(0);
  useLayoutEffect(() => {
    const host = listRef.current;
    if (split || !open || !host) return;
    let observed: HTMLElement | null = null;
    const observer = new ResizeObserver(() => measure());
    function measure() {
      if (!host) return;
      const anchor = host.querySelector<HTMLElement>(`[${DESK_RECORD_ANCHOR_ATTR}]`);
      if (anchor !== observed) {
        if (observed) observer.unobserve(observed);
        if (anchor) observer.observe(anchor);
        observed = anchor;
      }
      const top = anchor
        ? anchor.getBoundingClientRect().bottom - host.getBoundingClientRect().top
        : 0;
      setOverlayTop(Math.max(0, Math.round(top)));
    }
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [split, open]);

  const context = useMemo(
    () => ({ open, view, ownsEscape: open || split }),
    [open, view, split],
  );

  const regionLabel = typeof title === 'string' ? title : `Selected ${recordNoun}`;

  return (
    <DeskRecordPlaneContext.Provider value={context}>
      <div
        className={cn('relative flex min-h-0 min-w-0 flex-1', className)}
        data-desk-record-view={view}
      >
        <div ref={listRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {list}
        </div>

        {split ? (
          <section
            aria-label={regionLabel}
            data-testid={testId}
            data-desk-record-view="split"
            data-desk-record-open={open ? '' : undefined}
            className={DESK_SPLIT_RECORD_CLASS}
          >
            <motion.div
              className={DESK_SPLIT_RECORD_CARD_CLASS}
              initial={pane.presence.initial}
              animate={pane.presence.animate}
              transition={paneTransition}
            >
              {open ? (
                <>
                  <DeskStageRecordHeader
                    title={title}
                    subtitle={subtitle}
                    indexLabel={indexLabel}
                    onPrev={onPrev}
                    onNext={onNext}
                    prevDisabled={prevDisabled}
                    nextDisabled={nextDisabled}
                    onClose={onClose}
                    actions={actions}
                    viewSwitch={<DeskRecordViewSwitch />}
                  />
                  <motion.div
                    key={swapKey}
                    className={RECORD_BODY_CLASS}
                    initial={swap.presence.initial}
                    animate={swap.presence.animate}
                    transition={swapTransition}
                  >
                    {children}
                  </motion.div>
                  {footer ? (
                    <footer className="shrink-0 border-t border-border-hairline px-4 py-3">{footer}</footer>
                  ) : null}
                </>
              ) : (
                <div className={RECORD_BODY_CLASS}>
                  {summary ?? (
                    <p className="px-4 py-6 text-role-caption text-text-muted">Select {withArticle(recordNoun)}</p>
                  )}
                </div>
              )}
            </motion.div>
          </section>
        ) : open ? (
          // In place the record opens BELOW the list's anchor (its search row
          // and the record action strip, operator 2026-09-25): those stay
          // visible and live; the rows beneath are covered.
          <div className="absolute inset-x-0 bottom-0" style={{ top: overlayTop }}>
            <DeskStageOverlay
              open
              onClose={onClose}
              title={title}
              subtitle={subtitle}
              indexLabel={indexLabel}
              onPrev={onPrev}
              onNext={onNext}
              prevDisabled={prevDisabled}
              nextDisabled={nextDisabled}
              footer={footer}
              actions={actions}
              viewSwitch={<DeskRecordViewSwitch />}
              fill="stage"
              closeOnScrim={false}
              testId={testId}
            >
              <motion.div
                key={swapKey}
                ref={bodyRef}
                tabIndex={-1}
                className={cn(RECORD_BODY_CLASS, 'outline-none')}
                initial={swap.presence.initial}
                animate={swap.presence.animate}
                transition={swapTransition}
              >
                {children}
              </motion.div>
            </DeskStageOverlay>
          </div>
        ) : null}
      </div>
    </DeskRecordPlaneContext.Provider>
  );
}

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

interface DeskRecordLayoutProps {
  /** The work — items, Pick/Pack, labels, timeline, notes, verbs. */
  main: ReactNode;
  /**
   * Identity facts — customer, channel, ship-by, location, links. Omit for a
   * simple record (task, checklist item): one column at the record measure.
   */
  aside?: ReactNode;
  className?: string;
}

/**
 * One record, two widths: main 2/3 · aside 1/3 on the fixed stage (in place),
 * stacked in the split pane — decided by the plane's container, not the viewport.
 */
export function DeskRecordLayout({ main, aside, className }: DeskRecordLayoutProps) {
  if (aside == null) {
    return <div className={cn('mx-auto max-w-full', DESK_RECORD_MEASURE_CLASS, className)}>{main}</div>;
  }
  return (
    <div className={cn(DESK_RECORD_COLUMNS_CLASS, className)}>
      <div className={DESK_RECORD_MAIN_COLUMN_CLASS}>{main}</div>
      <aside className={DESK_RECORD_ASIDE_COLUMN_CLASS}>{aside}</aside>
    </div>
  );
}
