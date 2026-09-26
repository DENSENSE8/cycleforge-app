'use client';

/** Slot popovers for the product / unit sticker: */

import { type ReactNode, useRef, useState } from 'react';
import { Popover } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { LabelFaceSlotHandlers } from '@/components/labels/LabelFaceSlotOverlay';
import type { ProductLabelDraft } from '@/components/labels/ProductLabelEditPopover';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';

type SlotMenu = 'title' | 'condition' | 'color' | null;

const TEXT_INPUT = cn(
  'w-full min-w-[12rem] rounded-lg border border-border-soft bg-surface-card px-2.5 py-1.5 text-role-caption text-text-default',
  focusRing('field', 'accent'),
);

export function useLabelFaceProductSlots(
  draft: ProductLabelDraft,
  onChange: (next: ProductLabelDraft) => void,
): {
  slotHits: LabelFaceSlotHandlers;
  menus: ReactNode;
} {
  const [slotMenu, setSlotMenu] = useState<SlotMenu>(null);
  const topLeftRef = useRef<HTMLButtonElement>(null);
  const bottomLeftRef = useRef<HTMLButtonElement>(null);
  const bottomRightRef = useRef<HTMLButtonElement>(null);

  const toggle = (next: SlotMenu) => {
    setSlotMenu((cur) => (cur === next ? null : next));
  };

  const set = (patch: Partial<ProductLabelDraft>) => {
    onChange({ ...draft, ...patch });
  };

  const slotHits: LabelFaceSlotHandlers = {
    onTopLeft: () => toggle('title'),
    onTopRight: () => toggle('title'),
    onCenter: () => toggle('title'),
    onBottomLeft: () => toggle('condition'),
    onBottomRight: () => toggle('color'),
    topLeftRef,
    bottomLeftRef,
    bottomRightRef,
  };

  const menus = (
    <>
      <Popover
        open={slotMenu === 'title'}
        onClose={() => setSlotMenu(null)}
        anchorRef={topLeftRef}
        placement="bottom-start"
        role="dialog"
        aria-label="Label title"
        className="p-2"
      >
        <input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Title"
          className={TEXT_INPUT}
        />
      </Popover>
      <Popover
        open={slotMenu === 'condition'}
        onClose={() => setSlotMenu(null)}
        anchorRef={bottomLeftRef}
        placement="bottom-start"
        role="dialog"
        aria-label="Condition"
        className="min-w-[16rem] p-2"
      >
        <ConditionPills
          value={draft.condition}
          labelVariant="full"
          layout="scroll"
          onChange={(grade) => {
            set({ condition: grade });
            setSlotMenu(null);
          }}
        />
      </Popover>
      <Popover
        open={slotMenu === 'color'}
        onClose={() => setSlotMenu(null)}
        anchorRef={bottomRightRef}
        placement="bottom-end"
        role="dialog"
        aria-label="Color"
        className="p-2"
      >
        <input
          value={draft.color}
          onChange={(e) => set({ color: e.target.value })}
          placeholder="Color"
          className={TEXT_INPUT}
        />
      </Popover>
    </>
  );

  return { slotHits, menus };
}
