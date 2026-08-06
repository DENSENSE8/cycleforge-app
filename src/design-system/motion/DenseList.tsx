'use client';

/**
 * Layout-aware list for dense ledger lines that leave / reorder.
 *
 * Wrap the list in `DenseList`; each child MUST be `DenseListItem` with a
 * stable `key`. When a completed unit drops off, siblings spring into the gap
 * instead of snapping.
 *
 * Physics: `springSnappy` on each item's `layout` channel.
 */

import { motion } from './framer';
import { springSnappy } from './tokens';

export function DenseList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.ul layout className={className}>
      {children}
    </motion.ul>
  );
}

export function DenseListItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.li layout transition={springSnappy} className={className}>
      {children}
    </motion.li>
  );
}
