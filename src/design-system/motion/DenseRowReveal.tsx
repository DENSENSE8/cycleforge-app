'use client';

/**
 * Height + opacity reveal for dense accordion / expanding form rows.
 *
 * Animates height without inventing borders or margins — the "no gaps" ledger
 * rule stays intact. Prefer this over hand-rolling `AnimatePresence` +
 * `height: auto` in feature code.
 *
 * Physics: `springSnappy` (utilitarian spring — no bounce).
 */

import { cn } from '@/utils/_cn';

import { AnimatePresence, motion } from './framer';
import { springSnappy } from './tokens';

export interface DenseRowRevealProps {
  isVisible: boolean;
  children: React.ReactNode;
  className?: string;
}

export function DenseRowReveal({ isVisible, children, className }: DenseRowRevealProps) {
  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={springSnappy}
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
