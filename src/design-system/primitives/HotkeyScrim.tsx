'use client';

/**
 * HotkeyScrim — a control's keys, shown ONLY while the pointer rests on it,
 * in a bubble OUTSIDE the control (owner 2026-09-27: never painted over the
 * control's face). One repeatable display for every action control: give the
 * control `HOTKEY_SCRIM_HOST_CLASS` (and `aria-keyshortcuts`), render this as
 * its last child.
 *
 * At rest the control reads as its label alone. On hover (or keyboard focus)
 * the bubble appears beside it with shadcn's tooltip entrance — opacity 0→1,
 * scale 0.95→1 from the edge it grows from, on the mode's feedback duration
 * (0ms under reduced motion): the action, then the chord as inverse keycaps.
 * It never takes the pointer, so nothing under it is blocked. Touch screens
 * have no hover, so a phone never sees it.
 */

import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { cn } from '@/utils/_cn';

/** Classes the hosting control needs — the hover / focus group and the bubble's anchor. */
export const HOTKEY_SCRIM_HOST_CLASS = 'group/hotkey relative';

const SIDE_CLASS = {
  // Below by default: header verbs sit at the top of a clipped pane, so above would be cut off.
  bottom: 'top-full mt-1.5 origin-top',
  top: 'bottom-full mb-1.5 origin-bottom',
} as const;

const ALIGN_CLASS = {
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
  start: 'left-0',
} as const;

export function HotkeyScrim({
  keys,
  action,
  side = 'bottom',
  align = 'end',
  className,
}: {
  keys: readonly string[];
  /** What pressing the keys does — a verb phrase, never the control's own label. */
  action?: string;
  side?: keyof typeof SIDE_CLASS;
  align?: keyof typeof ALIGN_CLASS;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-testid="hotkey-scrim"
      className={cn(
        'pointer-events-none absolute z-tooltip flex w-max items-center gap-1.5 whitespace-nowrap',
        'rounded-md bg-mode-ink px-2 py-1 text-xs font-medium text-mode-panel shadow-md',
        SIDE_CLASS[side],
        ALIGN_CLASS[align],
        'scale-95 opacity-0 transition-[opacity,scale] duration-mode-feedback ease-out',
        'group-hover/hotkey:scale-100 group-hover/hotkey:opacity-100 group-focus-visible/hotkey:scale-100 group-focus-visible/hotkey:opacity-100',
        className,
      )}
    >
      {action ? <span>{action}</span> : null}
      {keys.map((key) => (
        <KeyboardKey key={key} size="xs" tone="inverse">
          {key}
        </KeyboardKey>
      ))}
    </span>
  );
}
