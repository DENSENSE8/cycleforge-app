'use client';

/**
 * The sheet's state mark (rail rows, tab strip): on file = solid green, owed =
 * ringed, exempt = faint. It pops when its document links (`useLinkPop`).
 */

import { motion } from 'motion/react';
import { isPacketGap, type PacketSlotState } from '@/lib/label-prints/order-packet-contracts';
import { cn } from '@/utils/_cn';
import { useLinkPop } from './use-link-pop';

export function DocMark({ state, title }: { state: PacketSlotState; title: string }) {
  const pop = useLinkPop(state === 'filled');
  return (
    <motion.span
      {...pop}
      title={title}
      aria-label={title}
      role="img"
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        state === 'filled'
          ? 'bg-fill-success'
          : isPacketGap(state)
            ? 'bg-surface-card ring-2 ring-inset ring-border-strong'
            : 'bg-border-soft',
      )}
    />
  );
}
