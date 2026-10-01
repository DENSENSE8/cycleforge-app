'use client';

import { Fragment, useRef, type ReactNode } from 'react';
import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { usePressHaptic } from '@/lib/scan-feedback/useScanFeedback';
import { FLOATING_CTA_WIDTH, FLOATING_DOCK_BOTTOM_PAD } from '@/design-system/tokens/dock-clearance';

export interface DetailDockVerb<Id extends string = string> {
  id: Id;
  label: string;
  icon: ReactNode;
  /** The one ink-filled verb. At most one per dock. */
  primary?: boolean;
  disabled?: boolean;
  /** Spinner in the cell while the verb's request runs; the cell is disabled. */
  loading?: boolean;
  /** The verb button's `data-testid`. */
  testId?: string;
}

/** State 2 — a batch is selected: the dismiss cell replaces nothing but leads the bar. */
interface DetailDockSelection {
  count: number;
  /** Clears the selection; the dock returns to its idle verbs. */
  onClear: () => void;
}

/** A second tap on the bar inside this window is a nervous double-tap, not a verb. */
const DETAIL_DOCK_LOCK_MS = 500;

/**
 * The phone's touch verb band: readable design-system buttons, double-tap
 * lock and press haptic.
 *
 * `placement="dock"` — the sticky bottom execution bar, up to three verbs.
 * `placement="inline"` — the same band in-flow under a record (a board row, an
 * order card): full width, not sticky, no safe-area pad, up to four verbs (four
 * lay out as a flush 2×2). Inline labels wrap rather than truncate (owner 2026-09-26).
 * `placement="float"` — a list screen's job CTA (owner 2026-09-28, `/m/pick` Start picking):
 * no bar at all — no rule, no ground; big pill buttons float over the list at ONE fixed,
 * centred width (`FLOATING_CTA_WIDTH` — the same on every phone, never edge to edge), lifted
 * off the bottom edge by a spacing step plus the safe-area inset. Mount it as the LAST child of the
 * scrolling list (a flex column): it sinks to the bottom of a short list, sticks there over a
 * long one while the list scrolls under it, and its own height in the flow is the list's
 * bottom clearance, so the last card is never hidden. Up to two verbs.
 */
export function DetailDock<Id extends string>({
  label,
  verbs,
  onVerb,
  selection = null,
  size = 'default',
  placement = 'dock',
  center,
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
  /** `inline` — in-flow under a record instead of the sticky bottom bar. `float` — the job CTA over a list. Selection is dock-only. */
  placement?: 'dock' | 'inline' | 'float';
  /**
   * The screen's scan control as the dock's MIDDLE cell, between two verbs
   * (owner 2026-09-26: scan is centred in the bottom bar, set apart by its
   * colour, not a row of its own). The node owns its own press and fill —
   * pass the camera's collapsed bar via `MobileCaptureWindow collapsedFrame`.
   * Dock placement only; takes the first two verbs.
   */
  center?: ReactNode;
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

  const inline = placement === 'inline';
  const centred = center != null && !inline && !selection;
  const shown = verbs.slice(0, selection || centred ? 2 : inline ? 4 : 3);
  // Four inline verbs are a 2×2; selection adds one clear action.
  const grid = selection
    ? shown.length >= 2
      ? 'grid-cols-3'
      : 'grid-cols-2'
    : centred || shown.length === 3
      ? 'grid-cols-3'
      : shown.length === 2 || shown.length === 4
        ? 'grid-cols-2'
        : 'grid-cols-1';
  // Float: the job CTA over a list — no bar, no rule, no ground; only the buttons take presses.
  if (placement === 'float') {
    return (
      <nav aria-label={label} data-dock="float" className={`pointer-events-none sticky bottom-0 z-sticky mt-auto ${FLOATING_DOCK_BOTTOM_PAD}`}>
        <div className={`grid gap-2 px-mode-page pb-4 pt-3 ${FLOATING_CTA_WIDTH} ${verbs.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {verbs.slice(0, 2).map((verb) => (
            <Button
              key={verb.id}
              variant={verb.primary ? 'primary' : 'secondary'}
              size="xl"
              radius="pill"
              depth
              className="pointer-events-auto w-full"
              icon={verb.icon}
              disabled={verb.disabled}
              loading={verb.loading}
              onClick={() => fire(() => onVerb(verb.id))}
              data-testid={verb.testId}
            >
              {verb.label}
            </Button>
          ))}
        </div>
      </nav>
    );
  }

  const buttons = (
    <>
      {selection ? (
        <Button
          variant="secondary"
          size="lg"
          className="min-h-mode-hit-cta w-full"
          icon={<X />}
          ariaLabel={`Clear selection (${selection.count} selected)`}
          onClick={() => clear(selection.onClear)}
        >
          {`${selection.count} selected`}
        </Button>
      ) : null}
      {shown.map((verb, i) => (
      <Fragment key={verb.id}>
        {centred && i === 1 ? center : null}
        <Button
          variant={verb.primary ? 'primary' : 'secondary'}
          size="lg"
          className={inline
            ? 'h-auto min-h-mode-hit w-full whitespace-normal leading-tight'
            : size === 'glove'
              ? 'min-h-mode-hit-cta w-full whitespace-nowrap text-role-caption'
              : 'min-h-mode-hit-cta w-full'}
          icon={verb.icon}
          disabled={verb.disabled}
          loading={verb.loading}
          onClick={() => fire(() => onVerb(verb.id))}
          data-testid={verb.testId}
        >
          {verb.label}
        </Button>
      </Fragment>
      ))}
    </>
  );

  if (inline) {
    return (
      <div role="group" aria-label={label} className={`grid gap-2 px-mode-page py-2 ${grid}`}>
        {buttons}
      </div>
    );
  }

  return (
    <nav aria-label={label} className="pb-safe sticky bottom-0 z-sticky border-t border-mode-rule bg-mode-bar px-mode-page py-2">
      <div className={`grid gap-2 ${grid}`}>{buttons}</div>
    </nav>
  );
}
