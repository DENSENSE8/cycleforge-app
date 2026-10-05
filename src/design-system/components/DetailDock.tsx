'use client';

import { Fragment, useRef, type ReactNode } from 'react';
import { X } from '@/components/Icons';
import { Button, type ButtonVariant } from '@/design-system/primitives';
import { usePressHaptic } from '@/lib/scan-feedback/useScanFeedback';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP, FLOATING_ACTION_DISABLED_FACE, FLOATING_CTA_WIDTH } from '@/design-system/tokens/dock-clearance';

export interface DetailDockVerb<Id extends string = string> {
  id: Id;
  label: string;
  icon: ReactNode;
  /** Directional continuation arrows may trail the label; all other glyphs lead. */
  iconPosition?: 'leading' | 'trailing';
  /** The one ink-filled verb. At most one per dock. */
  primary?: boolean;
  /** Semantic face for outcome docks (for example QC pass / fail). */
  variant?: ButtonVariant;
  /** Typography or layout refinement owned by this shared button. */
  className?: string;
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
 * Bottom verbs FLOAT (owner 2026-10-03): no bar, no rule, no ground fill —
 * never a white strip. Only the buttons, opaque and lifted off the bottom
 * edge by `ACTION_DOCK_LIFT` (a spacing step + the safe-area inset), with
 * `ACTION_DOCK_TOP_GAP` of air above them so content never meets a button's top edge. The band
 * itself ignores presses so the content scrolling under its gutters stays
 * reachable; only the buttons take them.
 *
 * `placement="dock"` — a job screen's sticky bottom verbs, up to three. Mount
 * it as the LAST child of the scrolling column: it sinks to the bottom of a
 * short screen, sticks over a long one, and its flow height is the column's
 * bottom clearance, so the last row is never hidden.
 * `placement="inline"` — the same band in-flow under a record (a board row, an
 * order card): full width, not sticky, no safe-area pad, up to four verbs (four
 * lay out as a flush 2×2). Inline labels wrap rather than truncate (owner 2026-09-26).
 * `placement="float"` — a list screen's job CTA (owner 2026-09-28, `/m/pick` Start picking):
 * big pill buttons at ONE fixed, centred width (`FLOATING_CTA_WIDTH` — the same on every
 * phone, never edge to edge). Same mounting as `dock`. Up to two verbs.
 * `placement="sheet"` — a non-sticky action floor owned by a bottom sheet's
 * flex column, with up to four verbs. Up to three secondary tools sit above
 * one full-width primary verb; no ground of its own — the sheet is the ground.
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
  placement?: 'dock' | 'inline' | 'float' | 'sheet';
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
  const sheet = placement === 'sheet';
  const centred = center != null && !inline && !selection;
  const shown = verbs.slice(0, selection || centred ? 2 : inline || sheet ? 4 : 3);
  // Four inline verbs are a 2×2; selection adds one clear action.
  const grid = selection
    ? shown.length >= 2
      ? 'grid-cols-3'
      : shown.length === 1
        ? 'grid-cols-2'
        : 'grid-cols-1'
    : centred || shown.length === 3
      ? 'grid-cols-3'
      : shown.length === 2 || shown.length === 4
        ? 'grid-cols-2'
        : 'grid-cols-1';
  // Float: the job CTA over a list — pill buttons at one fixed, centred width.
  if (placement === 'float') {
    return (
      <nav aria-label={label} data-dock="float" className={`pointer-events-none sticky bottom-0 z-sticky mt-auto px-mode-page ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT}`}>
        <div className={`grid gap-2 ${FLOATING_CTA_WIDTH} ${verbs.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {verbs.slice(0, 2).map((verb) => (
            <Button
              key={verb.id}
              variant={verb.variant ?? (verb.primary ? 'primary' : 'secondary')}
              size="xl"
              radius="pill"
              depth
              className={`pointer-events-auto w-full ${FLOATING_ACTION_DISABLED_FACE} ${verb.className ?? ''}`}
              icon={verb.iconPosition === 'trailing' ? undefined : verb.icon}
              iconRight={verb.iconPosition === 'trailing' ? verb.icon : undefined}
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

  if (sheet) {
    const primary = shown.find((verb) => verb.primary) ?? shown[0];
    const secondary = shown.filter((verb) => verb.id !== primary?.id);
    const sheetButton = (verb: DetailDockVerb<Id>, primaryAction = false) => (
      <Button
        key={verb.id}
        variant={verb.variant ?? (primaryAction ? 'primary' : 'secondary')}
        size={primaryAction ? 'xl' : 'lg'}
        radius="surface"
        depth={primaryAction}
        className="w-full"
        icon={verb.iconPosition === 'trailing' ? undefined : verb.icon}
        iconRight={verb.iconPosition === 'trailing' ? verb.icon : undefined}
        disabled={verb.disabled}
        loading={verb.loading}
        onClick={() => fire(() => onVerb(verb.id))}
        data-testid={verb.testId}
      >
        {verb.label}
      </Button>
    );

    return (
      <nav aria-label={label} data-dock="sheet" className={`shrink-0 px-mode-page ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT}`}>
        {secondary.length > 0 ? (
          <div className={`mb-2 grid gap-2 ${secondary.length === 3 ? 'grid-cols-3' : secondary.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {secondary.map((verb) => sheetButton(verb))}
          </div>
        ) : null}
        {primary ? sheetButton(primary, true) : null}
      </nav>
    );
  }

  // Three cells across a phone: icon over label, so a two-word verb never wraps.
  const stacked = !inline && grid === 'grid-cols-3';
  const floating = !inline;
  const buttons = (
    <>
      {selection ? (
        <Button
          variant="secondary"
          size="lg"
          radius="mode"
          depth
          className={`min-h-mode-hit-cta w-full ${stacked ? 'flex-col gap-1 px-2' : ''}`}
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
          variant={verb.variant ?? (verb.primary ? 'primary' : 'secondary')}
          size="lg"
          radius={floating ? 'mode' : 'control'}
          depth={floating}
          className={`${inline
            ? 'h-auto min-h-mode-hit w-full whitespace-normal leading-tight'
            : size === 'glove'
              ? 'min-h-mode-hit-cta w-full whitespace-nowrap text-role-caption'
              : 'min-h-mode-hit-cta w-full'} ${stacked && size !== 'glove' ? 'flex-col gap-1 whitespace-nowrap px-2' : ''} ${floating ? FLOATING_ACTION_DISABLED_FACE : ''} ${verb.className ?? ''}`}
          icon={verb.iconPosition === 'trailing' ? undefined : verb.icon}
          iconRight={verb.iconPosition === 'trailing' ? verb.icon : undefined}
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
    <nav aria-label={label} data-dock="dock" className={`pointer-events-none sticky bottom-0 z-sticky mt-auto px-mode-page ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT}`}>
      <div className={`grid gap-2 ${grid} [&>*]:pointer-events-auto`}>{buttons}</div>
    </nav>
  );
}
