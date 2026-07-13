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
  /** Default hero scale for every tile (an item's own `size` still wins). `wall` = TV density. */
  size?: 'default' | 'wall';
};

/**
 * Named Monitor rollup zone: 2×2 → 4-col responsive grid of {@link KpiTile}s.
 * This is one of the few places CSS grid is intentional on a Monitor surface.
 */
export function KpiStrip({ items, className, stagger = false, size }: KpiStripProps) {
  const gridClass = cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className);
  const tiles = items.map((item, i) => (
    <KpiTile key={item.label || i} size={size} {...item} />
  ));

  if (stagger) {
    return (
      <motion.section variants={framerVariants.monitorStaggerItem} className={gridClass}>
        {tiles}
      </motion.section>
    );
  }

  return <section className={gridClass}>{tiles}</section>;
}
