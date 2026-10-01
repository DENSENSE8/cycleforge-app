'use client';

import { useMemo } from 'react';
import { motion, type Variants } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import type { PeekCard } from './photo-peek-pending';

const PEEK_COUNT = 4;
const FAN_SPRING = { type: 'spring', stiffness: 320, damping: 26 } as const;

const peekCardVariants: Variants = {
  rest: (index: number) => ({
    x: 64 + index * 7,
    y: index * 3,
    rotate: -5 - index * 2,
    scale: 1 - index * 0.05,
    opacity: index === 0 ? 1 : 0.85 - index * 0.18,
    transition: FAN_SPRING,
  }),
  fan: (index: number) => ({
    x: 12 - index * 12,
    y: -index * 13,
    rotate: -6 - index * 9,
    scale: 1 - index * 0.03,
    opacity: 1,
    transition: FAN_SPRING,
  }),
};

export function PhotoPeekStack({
  cards,
  placement,
  hidden,
  state,
  onEnter,
  onLeave,
  onOpen,
}: {
  cards: ReadonlyArray<PeekCard>;
  placement: 'pane' | 'inline';
  hidden: boolean;
  state: 'rest' | 'fan';
  onEnter: () => void;
  onLeave: () => void;
  onOpen: () => void;
}) {
  const pendingCount = useMemo(
    () => cards.reduce((count, card) => count + (card.pending ? 1 : 0), 0),
    [cards],
  );
  const peekCards = useMemo(() => cards.slice(0, PEEK_COUNT), [cards]);
  if (hidden) return null;

  return (
    <div
      className={
        placement === 'pane'
          ? 'pointer-events-none absolute inset-y-0 right-0 z-20 flex items-end'
          : 'contents'
      }
    >
      <motion.button
        type="button"
        data-testid="photo-peek"
        className={cn(
          'ds-raw-button pointer-events-auto relative h-36 w-28 cursor-pointer',
          cornerClass('surface'),
          focusRing('control', 'neutral'),
          placement === 'pane' && 'mb-[calc(env(safe-area-inset-bottom,0px)+10rem)]',
        )}
        initial="rest"
        animate={state}
        variants={{ rest: {}, fan: { transition: { staggerChildren: 0.04 } } }}
        onHoverStart={onEnter}
        onHoverEnd={onLeave}
        onClick={onOpen}
        aria-label={
          pendingCount > 0
            ? `Photos ${cards.length} · ${pendingCount} uploading`
            : `Photos ${cards.length}`
        }
      >
        <span className="sr-only" aria-live="polite">
          {pendingCount > 0 ? `Uploading ${pendingCount}…` : null}
        </span>
        {peekCards.map((_, reverseIndex) => {
          const index = peekCards.length - reverseIndex - 1;
          const card = peekCards[index];
          if (!card) return null;
          return (
            <motion.div
              key={card.id}
              custom={index}
              variants={peekCardVariants}
              className={cn(
                'absolute inset-0 origin-top-left overflow-hidden ring-1 ring-border-soft will-change-transform',
                cornerClass('surface'),
                elevationClass('raised'),
              )}
              data-pending={card.pending ? 'true' : undefined}
            >
              {card.pending ? (
                <div
                  className="flex h-full w-full items-center justify-center bg-surface-sunken"
                  data-testid="photo-peek-pending"
                  aria-hidden
                >
                  <span className="h-6 w-6 animate-pulse rounded-full bg-border-soft" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.imgUrl}
                  alt={card.alt}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : undefined}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              )}
              {index === 0 && cards.length > 1 ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-scrim/60 inset-chip text-role-micro leading-none text-white tabular-nums backdrop-blur-sm">
                  {cards.length}
                </span>
              ) : null}
            </motion.div>
          );
        })}
      </motion.button>
    </div>
  );
}
