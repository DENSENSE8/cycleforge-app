'use client';

/** Slot popovers for the receiving (carton) sticker: */

import { type ReactNode, useRef, useState } from 'react';
import { Check } from '@/components/Icons';
import { Calendar } from '@/components/ui/calendar';
import { Popover } from '@/design-system/primitives';
import { LabelPlatformTypeMenu } from '@/components/labels/LabelPlatformTypeMenu';
import { formatLabelDate, parseLabelDate } from '@/components/labels/labelDate';
import type { LabelFaceSlotHandlers } from '@/components/labels/LabelFaceSlotOverlay';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import {
  LABEL_CORNER_ITEMS,
  type LabelCornerMode,
} from '@/components/receiving/workspace/line-edit/LabelEditPopover';

type SlotMenu = 'platformType' | 'date' | 'condition' | 'corner' | null;

const MENU_ITEM =
  'ds-raw-button flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-role-caption font-semibold transition-colors hover:bg-surface-hover';

type LabelFaceReceivingSlotValues = {
  platform: string;
  receivingType: string;
  date: string;
  condition: string;
  cornerMode: LabelCornerMode;
};

type LabelFaceReceivingSlotActions = {
  onPlatformChange: (next: { label: string; slug: string | null }) => void;
  onTypeChange: (slug: string) => void;
  onDateChange: (date: string) => void;
  onConditionChange: (grade: string) => void;
  onCornerChange?: (mode: LabelCornerMode) => void;
  onCenter?: () => void;
};

export function useLabelFaceReceivingSlots(
  values: LabelFaceReceivingSlotValues,
  actions: LabelFaceReceivingSlotActions,
): {
  slotHits: LabelFaceSlotHandlers;
  menus: ReactNode;
} {
  const [slotMenu, setSlotMenu] = useState<SlotMenu>(null);
  const topLeftRef = useRef<HTMLButtonElement>(null);
  const topRightRef = useRef<HTMLButtonElement>(null);
  const bottomLeftRef = useRef<HTMLButtonElement>(null);
  const cornerTriggerRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = (next: SlotMenu) => {
    setSlotMenu((cur) => (cur === next ? null : next));
  };

  const slotHits: LabelFaceSlotHandlers = {
    onTopLeft: () => toggleMenu('platformType'),
    onTopRight: () => toggleMenu('date'),
    onCenter: () => {
      setSlotMenu(null);
      actions.onCenter?.();
    },
    onBottomLeft: () => toggleMenu('condition'),
    onBottomRight: actions.onCornerChange ? () => toggleMenu('corner') : undefined,
    topLeftRef,
    topRightRef,
    bottomLeftRef,
    bottomRightRef: cornerTriggerRef,
  };

  const selectedDate = parseLabelDate(values.date);

  const menus = (
    <>
      <Popover
        open={slotMenu === 'platformType'}
        onClose={() => setSlotMenu(null)}
        anchorRef={topLeftRef}
        placement="bottom-start"
        role="dialog"
        aria-label="Platform and type"
        padded={false}
        className="min-w-[12.5rem]"
      >
        <LabelPlatformTypeMenu
          platform={values.platform}
          receivingType={values.receivingType}
          onPlatformChange={actions.onPlatformChange}
          onTypeChange={actions.onTypeChange}
        />
      </Popover>
      <Popover
        open={slotMenu === 'date'}
        onClose={() => setSlotMenu(null)}
        anchorRef={topRightRef}
        placement="bottom-end"
        role="dialog"
        aria-label="Label date"
        className="p-0"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(d?: Date) => {
            if (d) actions.onDateChange(formatLabelDate(d));
            setSlotMenu(null);
          }}
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
          value={values.condition}
          labelVariant="full"
          layout="scroll"
          onChange={(grade) => {
            actions.onConditionChange(grade);
            setSlotMenu(null);
          }}
        />
      </Popover>
      {actions.onCornerChange ? (
        <Popover
          open={slotMenu === 'corner'}
          onClose={() => setSlotMenu(null)}
          anchorRef={cornerTriggerRef}
          placement="bottom-end"
          role="listbox"
          aria-label="Label corner"
          padded={false}
          className="min-w-[10rem]"
        >
          <ul className="py-1">
            {LABEL_CORNER_ITEMS.map((opt) => {
              const selected = opt.id === values.cornerMode;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      actions.onCornerChange?.(opt.id as LabelCornerMode);
                      setSlotMenu(null);
                    }}
                    className={`${MENU_ITEM} ${selected ? 'text-text-default' : 'text-text-soft'}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {selected ? (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-600" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover>
      ) : null}
    </>
  );

  return { slotHits, menus };
}
