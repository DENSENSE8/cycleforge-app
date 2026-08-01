'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';

type FeedId = string | number;

export interface CaptureStackRowContext {
  variant: 'collapsed' | 'expanded';
  fresh: boolean;
  index: number;
  isLast: boolean;
}

export interface CaptureStackProps<T> {
  rows: T[];
  isLoading?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement>;
  freshIds?: Set<FeedId>;
  getId?: (row: T) => FeedId;
  /** Render the bottom (last) row as the 'expanded' card. Default true. */
  expandLast?: boolean;
  renderRow: (row: T, ctx: CaptureStackRowContext) => ReactNode;
  empty?: ReactNode;
  loading?: ReactNode;
  /** Extra classes on the scroll container. */
  className?: string;
}

const defaultGetId = <T,>(row: T): FeedId => (row as { id: FeedId }).id;

const DefaultEmpty = (
  <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-card px-6 text-center">
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Nothing here yet</p>
  </div>
);

const DefaultLoading = (
  <div className="flex h-full items-center justify-center bg-surface-card text-role-caption font-semibold uppercase tracking-widest text-text-faint">
    Loading…
  </div>
);

/**
 * The house **bottom-anchored capture stack**: the current task expanded at the
 * bottom, every completed row collapsed to a single line and pushed up into a
 * scrollable ledger. Owns the scroll container + the layout/spring animation per
 * row; callers supply `renderRow` (usually a domain row wrapped in
 * {@link CaptureStackRow}). Pair with `useCaptureStackWindow` for windowing +
 * auto-scroll + fresh pulse — bottom-anchoring lives across BOTH files, so they
 * move and change together.
 *
 * Promoted verbatim from `components/mobile/feed/MobileFeed` (capture-stack
 * Phase 1) so stations migrate onto one primitive instead of forking a
 * `StationTimelineShell`. Contract pinned by `capture-stack.guard.test.ts`.
 *
 * TODO(capture-stack): Phase 2 migrates the inline variants below onto
 * `useMotionPresence` / `useMotionTransition` and adds this file to
 * `station-motion-bridge.guard.test.ts` in the same commit. It is compliant in
 * effect today (it branches on `useReducedMotion`), and rewriting it here would
 * break the byte-identical requirement of the promotion.
 */
export function CaptureStack<T>({
  rows,
  isLoading = false,
  scrollRef,
  freshIds,
  getId = defaultGetId,
  expandLast = true,
  renderRow,
  empty,
  loading,
  className = '',
}: CaptureStackProps<T>) {
  const reduceMotion = useReducedMotion();

  if (isLoading && rows.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{loading ?? DefaultLoading}</div>;
  }
  if (rows.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{empty ?? DefaultEmpty}</div>;
  }

  const lastIndex = rows.length - 1;

  return (
    // Bottom-anchored feeds (expandLast) use flex-col + an mt-auto spacer so a
    // SHORT list pins to the bottom (newest just above the nav) instead of
    // stranding at the top with a big gap — scrollTo(bottom) only works once the
    // list overflows, so the spacer covers the short-list case.
    <div
      ref={scrollRef}
      className={`min-h-0 w-full max-w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none ${expandLast ? 'flex flex-col' : ''} ${className}`}
    >
      {expandLast && <div className="mt-auto shrink-0" aria-hidden />}
      <LayoutGroup>
        <AnimatePresence initial={false}>
          {rows.map((row, i) => {
            const id = getId(row);
            const isLast = i === lastIndex;
            const variant: 'collapsed' | 'expanded' = expandLast && isLast ? 'expanded' : 'collapsed';
            const fresh = freshIds?.has(id) ?? false;
            return (
              <motion.div
                key={id}
                layout={reduceMotion ? false : 'position'}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: variant === 'expanded' ? 24 : 10, scale: variant === 'expanded' ? 0.98 : 1 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', damping: 28, stiffness: 340, mass: 0.55 }
                }
              >
                {renderRow(row, { variant, fresh, index: i, isLast })}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
