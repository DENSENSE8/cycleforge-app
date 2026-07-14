'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DateGroupHeader } from '@/components/ui/DateGroupHeader';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { QueueGroupRow } from './QueueGroupRow';

export interface QueueDateSectionProps {
  date: string;
  /** Order groups for this day, in the canonical per-day sort order. */
  groups: RowGroup<ShippedOrder>[];
  isMobile: boolean;
  /** Render a single queue row at the given zebra-stripe index. */
  renderRow: (record: ShippedOrder, stripeIndex: number) => ReactNode;
  /**
   * When false, skip AnimatePresence (virtualized remounts). Default true so
   * Show more / Show less can exit-animate rows and let siblings layout-reflow.
   */
  animateRows?: boolean;
  stickyTopClass?: string;
}

/**
 * One date band: a {@link DateGroupHeader} plus its rows. Singleton orders
 * render as plain rows; multi-product orders fold into a {@link CollapsibleGroupRow}.
 * `stripeIndex` runs across the whole day (group children included) so zebra
 * striping stays consistent.
 */
export function QueueDateSection({
  date,
  groups,
  isMobile,
  renderRow,
  animateRows = true,
  stickyTopClass,
}: QueueDateSectionProps) {
  // groups preserve the per-day sort order (groupRowsBy), matching
  // displayedRecords so shift-range select lines up with the view. `stripeIndex`
  // runs across the whole day (group children included) via each group's base.
  let stripeIndex = 0;
  const dayTotal = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const rowPresence = useMotionPresence(framerPresence.tableRow);
  const mountTransition = useMotionTransition(framerTransition.tableRowMount);
  const layoutTransition = useMotionTransition(framerTransition.chipColumnLayout);

  const body = groups.map((group) => {
    const baseStripeIndex = stripeIndex;
    stripeIndex += group.rows.length;
    const row = (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        isMobile={isMobile}
        renderRow={renderRow}
      />
    );
    // AnimatePresence needs a motion child with a stable key so Show more/less
    // can exit-animate rows; layout reflows siblings with the chip-column spring.
    if (!animateRows) {
      return (
        <div key={`order-${group.key}`}>
          {row}
        </div>
      );
    }
    return (
      <motion.div
        key={`order-${group.key}`}
        // Presence only on the AnimatePresence child (enter/exit for Show more).
        // Layout lives on OrdersQueueTableRow so title + chips reflow together.
        {...rowPresence}
        transition={{
          opacity: mountTransition,
          y: mountTransition,
        }}
      >
        {row}
      </motion.div>
    );
  });

  return (
    <motion.div
      layout={animateRows}
      className="flex flex-col gap-1"
      transition={animateRows ? { layout: layoutTransition } : undefined}
    >
      <DateGroupHeader date={date} total={dayTotal} animate={animateRows} stickyTopClass={stickyTopClass} />
      {animateRows ? (
        <AnimatePresence initial={false} mode="popLayout">
          {body}
        </AnimatePresence>
      ) : (
        body
      )}
    </motion.div>
  );
}
