'use client';

/**
 * The persistent bottom sheet a mobile station works in.
 *
 * ## This is NOT `@/components/ui/BottomSheet`, and must not become it
 *
 * That one is a MODAL: it portals to `<body>`, paints a scrim, registers in the
 * overlay stack and traps focus, because it interrupts you to ask something.
 * This one interrupts nothing. It is the station's primary working surface —
 * in-flow, always mounted, non-modal, with the tape live and readable above it
 * the whole time. Dismissing it REVEALS content rather than closing a dialog,
 * and it has no scrim because there is nothing behind it to suppress.
 *
 * Swapping this for the modal would trap focus on a screen whose whole job is
 * to keep the list behind it reachable. Two different jobs, two components.
 *
 * ## Hardened
 *
 * The gesture is not the only way in or out. Everything the drag does, the
 * keyboard and a screen reader can do too:
 *
 *  - the grab bar is a real `<button>` (tap or Enter to collapse), not a
 *    decorative pill, so the affordance is also the control;
 *  - `Escape` collapses while expanded;
 *  - the collapsed state is a full-width 56px button that says what it will do;
 *  - `aria-expanded` + `aria-controls` tie the two states together, so AT
 *    announces a disclosure rather than content vanishing;
 *  - under `prefers-reduced-motion` the sheet snaps instead of springing, and
 *    the drag is disabled — a vestibular-safe path to the same two states.
 *
 * ## What a station supplies
 *
 * Content, a label, and how tall it wants to be. Nothing here knows what a
 * camera is.
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { motion, useReducedMotion, type PanInfo } from '@/design-system/motion';
import { ChevronUp } from '@/components/Icons';
import { MOBILE_SCAN_WINDOW_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { STATION_EYEBROW_CLASS } from './station-chrome';
import { STATION_SHEET_HEIGHT_CLASS } from './station-metrics';

/**
 * How far down, or how fast, counts as "put it away".
 *
 * Both, not either-or by taste: a gloved thumb on a cold dock rarely produces a
 * clean 96px pull, and an operator resting a hand on the sheet must not lose it.
 * A short flick clears the velocity gate; a slow deliberate drag clears the
 * offset one.
 */
const DISMISS_OFFSET_PX = 96;
const DISMISS_VELOCITY = 550;

export function MobileStationSheet({
  /** Accessible name for the sheet and its collapsed bar. */
  label,
  /** What the collapsed bar says. A verb — it is the control, not a caption. */
  collapsedLabel,
  /** Short state line painted INSIDE the sheet, top-right. A count, never prose. */
  status,
  /** Renders `status` in the alert ink. */
  statusAlert = false,
  open,
  onOpenChange,
  /** Height while open. Defaults to the station sheet height. */
  heightClass = STATION_SHEET_HEIGHT_CLASS,
  /** Ground behind the content. Camera surfaces want the dark stage. */
  surfaceClass = 'bg-stage',
  /** Rendered over the content, top-centre. The grab bar sits above it. */
  children,
}: {
  label: string;
  collapsedLabel: string;
  status?: string;
  statusAlert?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightClass?: string;
  surfaceClass?: string;
  children?: React.ReactNode;
}) {
  const bodyId = useId();
  const reduceMotion = useReducedMotion();

  // Held in a ref so the Escape listener does not resubscribe on every render
  // of a parent that passes an inline handler.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const collapse = useCallback(() => onOpenChangeRef.current(false), []);
  const expand = useCallback(() => onOpenChangeRef.current(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, collapse]);

  const onDragEnd = useCallback(
    (_e: unknown, info: PanInfo) => {
      if (info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY) collapse();
    },
    [collapse],
  );

  if (!open) {
    return (
      // The primary CTA of the whole screen while the sheet is away — so it is
      // painted as one. Emerald, the same green the house gives a SERIAL
      // (`CHIP_TONES.serial`), because on a floor station green is the colour of
      // a good read; blue is navigation and this is not navigation.
      <button
        type="button"
        onClick={expand}
        aria-expanded={false}
        aria-controls={bodyId}
        className={cn(
          MOBILE_SCAN_WINDOW_CORNER,
          // `cta` rung of MOBILE_CONTROL_LADDER: 44px, the one place paint
          // equals hit because this IS the screen's primary action. It was
          // min-h-14 (56px) — a desk-sized commit on a phone.
          'flex min-h-11 shrink-0 items-center justify-center gap-2',
          'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25',
          'active:bg-emerald-700',
          focusRing('control', 'accent'),
        )}
      >
        <ChevronUp className="h-4 w-4" aria-hidden />
        <span className={cn('text-role-caption font-semibold', STATION_EYEBROW_CLASS)}>
          {collapsedLabel}
        </span>
      </button>
    );
  }

  return (
    <motion.section
      id={bodyId}
      aria-label={label}
      // Down only, and it never travels on its own: both constraints are pinned
      // so the sheet rubber-bands rather than detaching, and the RELEASE decides.
      drag={reduceMotion ? false : 'y'}
      dragDirectionLock
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.55 }}
      onDragEnd={onDragEnd}
      className={cn(
        MOBILE_SCAN_WINDOW_CORNER,
        // Clipped to the lip so content cannot square off the corners.
        'relative shrink-0 overflow-hidden',
        surfaceClass,
        heightClass,
        // Only while draggable: `touch-none` on a non-draggable sheet would
        // swallow scroll from any content a station puts inside.
        !reduceMotion && 'touch-none',
      )}
    >
      {children}

      {/* The station's state line, inside its own surface — a count, or what is
          in flight. It used to be a page-level band above the lip, which both
          restated the page title and opened a gap between the tape and the
          sheet. */}
      {status && (
        <span
          role="status"
          className={cn(
            'absolute right-3 top-3 z-20 px-2 py-0.5 text-role-eyebrow tabular-nums backdrop-blur',
            'rounded-full',
            STATION_EYEBROW_CLASS,
            statusAlert ? 'bg-rose-600/90 text-white' : 'bg-scrim/55 text-white',
          )}
        >
          {status}
        </span>
      )}

      {/*
        The grab bar is the affordance AND the control.

        A decorative pill would leave the dismiss reachable only by gesture,
        which is unusable by keyboard and invisible to AT. As a button it is
        both: drag it, tap it, or focus it and press Enter. 44px of target with
        a 4px pill drawn inside — the mark stays small, the hit area does not.

        White with a dark ring because the lens below is usually pointed at a
        WHITE shipping label, which swallows any light-on-light mark.
      */}
      <button
        type="button"
        onClick={collapse}
        aria-expanded
        aria-controls={bodyId}
        aria-label={`Hide ${label.toLowerCase()}`}
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex h-11 items-start justify-center pt-2.5',
          focusRing('control', 'accent'),
        )}
      >
        <span
          aria-hidden
          className="h-1 w-10 rounded-full bg-white ring-1 ring-scrim/40"
        />
      </button>
    </motion.section>
  );
}
