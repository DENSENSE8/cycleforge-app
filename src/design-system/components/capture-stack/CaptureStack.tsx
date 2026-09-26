'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';

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

/** The house **bottom-anchored capture stack**: */
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
  // Resolved per VARIANT, not per row: hooks cannot be called inside the map.
  const expandedPresence = useMotionPresence(framerPresence.captureStackRowExpanded);
  const collapsedPresence = useMotionPresence(framerPresence.captureStackRowCollapsed);
  const transition = useMotionTransition(framerTransition.captureStackRowMount);

  if (isLoading && rows.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{loading ?? DefaultLoading}</div>;
  }
  if (rows.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{empty ?? DefaultEmpty}</div>;
  }

  const lastIndex = rows.length - 1;

  return (
    // Bottom-anchored feeds (expandLast) use flex-col + an mt-auto spacer so a SHORT list pins to the bottom (newest just above the nav)…
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
            const presence = variant === 'expanded' ? expandedPresence : collapsedPresence;
            return (
              <motion.div
                key={id}
                layout={reduceMotion ? false : 'position'}
                initial={presence.initial}
                animate={presence.animate}
                exit={presence.exit}
                transition={transition}
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
