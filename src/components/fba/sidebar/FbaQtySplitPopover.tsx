'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from '@/design-system/motion';
import { Button, DeferredQtyInput } from '@/design-system/primitives';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { microBadge } from '@/design-system/tokens/typography/presets';

interface FbaQtySplitPopoverProps {
  itemId: number;
  fnsku: string;
  maxQty: number;
  onConfirm: (moveQty: number) => void;
  onCancel: () => void;
}

export function FbaQtySplitPopover({
  fnsku,
  maxQty,
  onConfirm,
  onCancel,
}: FbaQtySplitPopoverProps) {
  const [moveQty, setMoveQty] = useState(maxQty);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <motion.div
      ref={containerRef}
      initial={motionPresence.dropdownPanel.initial}
      animate={motionPresence.dropdownPanel.animate}
      exit={motionPresence.dropdownPanel.exit}
      transition={motionTransition.dropdownOpen}
      className="absolute inset-x-0 top-0 z-dropdown mx-2 rounded-none border border-border-accent bg-surface-card p-3 shadow-none"
    >
      <p className={`${microBadge} mb-2 tracking-wider text-text-muted`}>
        Move how many? <span className="font-mono text-text-default">{fnsku}</span>
      </p>

      <div className="flex items-center gap-2">
        <DeferredQtyInput
          value={moveQty}
          min={1}
          max={maxQty}
          onChange={setMoveQty}
          className="h-8 w-16 rounded-none border border-border-soft bg-surface-card text-center text-sm font-semibold tabular-nums outline-none focus:border-border-accent"
        />
        <span className={`${microBadge} text-text-faint`}>of {maxQty}</span>
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          radius="flush"
          onClick={() => onConfirm(moveQty)}
          className="flex-1 text-role-micro uppercase tracking-wider"
        >
          Move
        </Button>
        <Button
          variant="secondary"
          size="sm"
          radius="flush"
          onClick={onCancel}
          className="flex-1 text-role-micro uppercase tracking-wider text-text-muted"
        >
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}
