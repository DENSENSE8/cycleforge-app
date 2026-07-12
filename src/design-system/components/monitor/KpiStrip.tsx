'use client';

import { motion } from 'framer-motion';
import { cn } from '@/utils/_cn';
import { framerVariants } from '@/design-system/foundations/motion-framer';
import { KpiTile, type KpiTileProps } from './KpiTile';

export type KpiStripProps = {
  items: KpiTileProps[];
  className?: string;
  /**
   * When true, each tile is a motion child of a Monitor stagger container.
   * Parent must use `framerVariants.monitorStaggerContainer` with
   * `initial="hidden" animate="visible"`.
   */
  stagger?: boolean;
};

/**
 * Named Monitor rollup zone: 2×2 → 4-col responsive grid of {@link KpiTile}s.
 * This is one of the few places CSS grid is intentional on a Monitor surface.
 */
export function KpiStrip({ items, className, stagger = false }: KpiStripProps) {
  const gridClass = cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className);

  if (stagger) {
    return (
      <motion.section variants={framerVariants.monitorStaggerItem} className={gridClass}>
        {items.map((item, i) => (
          <KpiTile key={item.label || i} {...item} />
        ))}
      </motion.section>
    );
  }

  return (
    <section className={gridClass}>
      {items.map((item, i) => (
        <KpiTile key={item.label || i} {...item} />
      ))}
    </section>
  );
}
