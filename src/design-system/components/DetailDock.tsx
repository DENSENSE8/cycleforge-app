'use client';

import { useRef, type ReactNode } from 'react';
import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { usePressHaptic } from '@/lib/scan-feedback/useScanFeedback';

export interface DetailDockVerb<Id extends string = string> {
  id: Id;
  label: string;
  icon: ReactNode;
  /** The one ink-filled verb. At most one per dock. */
  primary?: boolean;
  disabled?: boolean;
}

/** State 2 — a batch is selected: the dismiss cell replaces nothing but leads the bar. */
export interface DetailDockSelection {
  count: number;
  /** Clears the selection; the dock returns to its idle verbs. */
  onClear: () => void;
}

/** A second tap on the bar inside this window is a nervous double-tap, not a verb. */
export const DETAIL_DOCK_LOCK_MS = 500;

/**
 * The phone's ONE bottom execution bar (the exoskeleton dock, operator
 * 2026-09-24; the industrial terminal block, 2026-09-25): at most three verbs,
 * one primary, pinned under the thumb on every scroll position.
 *
 * - **Terminal block.** Flush 0→390, 72px cells (`min-h-18`), square, no gap;
 *   a 1px mode rule on top and between cells. `sticky bottom-0` at the end of
 *   the route's flex column, not `fixed`, so the last row is never hidden
 *   under it; the safe-area inset rides on the bottom padding.
 * - **State 3 — one job.** A single verb fills the whole bar (Next unit, Scan
 *   another label): tap anywhere on the bottom of the phone.
 * - **State 2 — selection.** With `selection`, a dark dismiss cell (`✕ 3 SEL`,
 *   30%) leads the verbs (70%, split evenly for two). The asymmetric split
 *   keeps cancel away from the thumb aiming at execute.
 * - **Press.** The cell inverts to ink the instant it is pressed (CSS
 *   `:active`, no transition, no scale — a shrinking flush cell pulls off its
 *   rules) and, when the staffer turned haptics on (`receiving.scanHaptics`,
 *   default off), the phone buzzes where the Vibration API exists (not iOS).
 * - **Lock.** Leading edge: the first verb tap fires at once; further verb
 *   taps are dropped for {@link DETAIL_DOCK_LOCK_MS}, or until the verb's
 *   promise settles if `onVerb` returns one. Nothing is delayed. The
 *   selection's dismiss cell is outside the lock (backing out is never
 *   swallowed) but arms it: the bar swaps to its idle verbs under the same
 *   thumb, and a nervous second tap must not land on the verb swapped in.
 *
 * No global navigation here: the bottom nav was removed for accidental taps
 * (`MobileSidebarDrawer`) and stays in the drawer.
 */
export function DetailDock<Id extends string>({
  label,
  verbs,
  onVerb,
  selection = null,
  size = 'default',
}: {
  /** Accessible name of the dock (`Repair actions`, `SKU exception actions`). */
  label: string;
  verbs: readonly DetailDockVerb<Id>[];
  onVerb: (id: Id) => void | Promise<unknown>;
  selection?: DetailDockSelection | null;
  /**
   * `glove` — icon and label on ONE row with caption type, so a three-word
   * verb (`Out of Stock`) fits a third of a phone without wrapping (the
   * directed picker, worked one-handed with gloves at the shelf).
   */
  size?: 'default' | 'glove';
}) {
  const lockedUntil = useRef(0);
  const inFlight = useRef(false);
  const haptic = usePressHaptic();

  const fire = (run: () => void | Promise<unknown>) => {
    const now = Date.now();
    if (inFlight.current || now < lockedUntil.current) return;
    lockedUntil.current = now + DETAIL_DOCK_LOCK_MS;
    haptic();
    const result = run();
    if (result && typeof (result as Promise<unknown>).finally === 'function') {
      inFlight.current = true;
      void (result as Promise<unknown>).finally(() => {
        inFlight.current = false;
      });
    }
  };

  const clear = (onClear: () => void) => {
    lockedUntil.current = Date.now() + DETAIL_DOCK_LOCK_MS;
    haptic();
    onClear();
  };

  const shown = verbs.slice(0, selection ? 2 : 3);
  const cell =
    size === 'glove'
      ? 'min-h-18 w-full gap-1 whitespace-nowrap px-1 text-role-caption'
      : 'min-h-18 w-full px-2 text-mode-body';
  // Instant inversion; cancel the primitive's scale + colour transition.
  const still = 'shadow-none ring-0 transition-none enabled:active:scale-100';
  const press = `${still} active:bg-mode-ink active:text-mode-panel`;

  // Twentieths: 30% dismiss + 70% verbs (35/35 for two).
  const grid = selection
    ? shown.length >= 2
      ? 'grid-cols-20'
      : 'grid-cols-10'
    : shown.length >= 3
      ? 'grid-cols-3'
      : shown.length === 2
        ? 'grid-cols-2'
        : 'grid-cols-1';
  const verbSpan = selection ? 'col-span-7' : '';
  const clearSpan = selection ? (shown.length >= 2 ? 'col-span-6' : 'col-span-3') : '';

  return (
    <nav aria-label={label} className="pb-safe sticky bottom-0 z-sticky border-t border-mode-rule bg-mode-bar">
      <div className={`grid divide-x divide-mode-rule ${grid}`}>
        {selection ? (
          <Button
            variant="ink"
            size="lg"
            radius="flush"
            className={`${cell} ${clearSpan} ${still} active:bg-mode-panel active:text-mode-ink font-mono uppercase`}
            icon={<X />}
            ariaLabel={`Clear selection (${selection.count} selected)`}
            onClick={() => clear(selection.onClear)}
          >
            {`${selection.count} SEL`}
          </Button>
        ) : null}
        {shown.map((verb) => (
          <Button
            key={verb.id}
            variant={verb.primary ? 'primary' : 'secondary'}
            size="lg"
            radius="flush"
            className={`${cell} ${verbSpan} ${press} ${shown.length === 1 && !selection ? 'font-bold' : ''}`}
            icon={verb.icon}
            disabled={verb.disabled}
            onClick={() => fire(() => onVerb(verb.id))}
          >
            {verb.label}
          </Button>
        ))}
      </div>
    </nav>
  );
}
