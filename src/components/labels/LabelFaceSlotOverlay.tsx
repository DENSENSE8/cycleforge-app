'use client';

/** Invisible hit map over the print-faithful sticker ({@link LabelFacePreview}). */

import { type Ref } from 'react';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

const SLOT =
  // ds-allow-raw-neutral: hover tint on print-faithful sticker; ink-on-paper stays literal.
  'ds-raw-button pointer-events-auto min-w-0 rounded-none bg-transparent hover:bg-black/[0.05]';

export type LabelFaceSlotHandlers = {
  onTopLeft?: () => void;
  onTopRight?: () => void;
  onCenter?: () => void;
  onBottomLeft?: () => void;
  onBottomRight?: () => void;
  topLeftRef?: Ref<HTMLButtonElement>;
  topRightRef?: Ref<HTMLButtonElement>;
  bottomLeftRef?: Ref<HTMLButtonElement>;
  bottomRightRef?: Ref<HTMLButtonElement>;
};

function SlotButton({
  slot,
  label,
  onClick,
  buttonRef,
  popup,
  className,
}: {
  slot: string;
  label: string;
  onClick?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  popup?: boolean;
  className?: string;
}) {
  if (!onClick) return <div className={className} aria-hidden />;
  return (
    <button
      ref={buttonRef}
      type="button"
      data-label-slot={slot}
      aria-label={label}
      aria-haspopup={popup ? 'listbox' : undefined}
      onClick={onClick}
      className={cn(SLOT, focusRing('control', 'accent'), className)}
    />
  );
}

export function LabelFaceSlotOverlay(props: LabelFaceSlotHandlers) {
  const {
    onTopLeft,
    onTopRight,
    onCenter,
    onBottomLeft,
    onBottomRight,
    topLeftRef,
    topRightRef,
    bottomLeftRef,
    bottomRightRef,
  } = props;

  if (!onTopLeft && !onTopRight && !onCenter && !onBottomLeft && !onBottomRight) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex"
      data-label-face-slots=""
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-[13%] shrink-0">
          <SlotButton
            slot="top-left"
            label="Change platform and type"
            onClick={onTopLeft}
            buttonRef={topLeftRef}
            popup
            className="h-full min-w-0 flex-1 cursor-pointer"
          />
          <SlotButton
            slot="top-right"
            label="Change label date"
            onClick={onTopRight}
            buttonRef={topRightRef}
            popup
            className="h-full w-[38%] shrink-0 cursor-pointer"
          />
        </div>
        <SlotButton
          slot="center"
          label="Edit item note"
          onClick={onCenter}
          className="min-h-0 w-full flex-1 cursor-text"
        />
        <div className="flex h-[13%] shrink-0">
          <SlotButton
            slot="bottom-left"
            label="Change condition"
            onClick={onBottomLeft}
            buttonRef={bottomLeftRef}
            popup
            className="h-full min-w-0 flex-1 cursor-pointer"
          />
          <SlotButton
            slot="bottom-right"
            label="Change label corner"
            onClick={onBottomRight}
            buttonRef={bottomRightRef}
            popup
            className="h-full w-[42%] shrink-0 cursor-pointer"
          />
        </div>
      </div>
      <div className="h-full w-[43%] shrink-0" aria-hidden />
    </div>
  );
}
