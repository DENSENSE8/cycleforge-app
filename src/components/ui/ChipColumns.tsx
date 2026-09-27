'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';

/** Fixed column widths for a table row's identity-chip grid. */
export const CHIP_COL = {
  /** PlatformChip (amazon / ebay / walmart …). */
  platform: 'w-[92px]',
  /** Hash-style id chips: OrderIdChip, PoChip, SkuScanRefChip. */
  id: 'w-[96px]',
  /** TrackingChip / TrackingOrSkuScanChip / FnskuChip. */
  tracking: 'w-[96px]',
  /** SerialChip — same width as the other last-8 columns so the gap between the tracking and serial values matches every other inter-column gap. */
  serial: 'w-[96px]',
} as const;

export interface ChipColumn {
  key: string;
  /** Tailwind width utility (use a CHIP_COL value) — fixed so the column aligns row-to-row. */
  width: string;
  /** The chip to render, or null to reserve an empty column (FBA etc.). */
  node: ReactNode;
}

/** Right-aligned, fixed-column layout for a desktop table row's identity chips. */
export function ChipColumns({
  columns,
  className,
}: {
  columns: ChipColumn[];
  className?: string;
}) {
  // Per-staff column hiding went with the column-display rail (2026-08-29):
  // every declared slot paints.
  const isHidden = (_key?: string) => false;
  const layoutTransition = useMotionTransition(motionTransition.chipColumnLayout);
  const presenceTransition = useMotionTransition(motionTransition.dropdownOpen);

  return (
    <LayoutGroup>
      <div
        className={cn(
          'flex shrink-0 items-center justify-end gap-0.5 pr-1 -mr-1.5',
          className,
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {columns.map((c) => {
            if (isHidden(c.key)) return null;
            return (
              <motion.div
                key={c.key}
                layout
                layoutScroll
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{
                  layout: layoutTransition,
                  opacity: presenceTransition,
                  x: presenceTransition,
                }}
                data-col={c.key}
                className={cn('flex items-center justify-end', c.width)}
              >
                {c.node}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
