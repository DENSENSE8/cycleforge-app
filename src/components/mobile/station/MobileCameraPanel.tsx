'use client';

/**
 * The bottom CAMERA PANEL every mobile scan kernel mounts.
 *
 * This is the SoT chrome for "a lens is open on this phone". `MobileCaptureWindow`
 * owns the lens; this file owns the box it sits in and the one row of controls
 * above it. A station supplies content, a label, a status line and a leading
 * control — nothing here knows what a barcode is.
 *
 * ## It is a PANEL, not a sheet (operator 2026-09-11)
 *
 * It used to be `MobileStationSheet`: draggable, with a grab bar, dismissed by
 * throwing it downward. That is modal-ish furniture on the one surface that is
 * never furniture — the camera IS the screen's job, so a gesture whose only
 * outcome is "make the job go away" is a way to lose the lens by accident while
 * holding a box. Three separate failures came out of that shape:
 *
 *  - the dismiss was a GESTURE with a decorative-looking handle, so the only
 *    labelled way out was to discover that the handle was also a button;
 *  - the controls were scattered over the live feed — type-a-label pinned
 *    top-left, status pill top-right, grabber centre — three corners of chrome
 *    painted on the picture the operator is trying to aim;
 *  - the feed was the panel's whole body, so anything the station needed to say
 *    had to be painted ON the image, over whatever the lens was looking at.
 *
 * So: a fixed panel, square-lipped, flush under the tape, with ONE short header
 * row of its own ground and three fixed slots. Nothing is drawn on the feed.
 *
 *   ┌──────────────────────────────────────┐
 *   │ [T]        2 in flight        [Done] │  ← 36px header, its own ground
 *   ├──────────────────────────────────────┤
 *   │                                      │
 *   │            live camera               │  ← the stage. Picture only.
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * Left is the station's leading control (the keyed-label fallback, or its
 * cancel while typing). Middle is what is happening RIGHT NOW — the in-flight
 * count, the shift count, "Offline". Right is Done, the labelled way out that
 * the drag gesture used to be. The slots never move between states, so the
 * operator's thumb and eye learn one geometry.
 *
 * ## Done, and the way back
 *
 * Done stops the lens and collapses the panel to a full-width 44px CTA that
 * brings it back. That is a disclosure, not a sheet: no scrim, no focus trap,
 * no portal, no drag, and the tape stays live and readable the whole time.
 * `Escape` is Done's keyboard twin.
 *
 * ## Height
 *
 * The panel — header INCLUDED — stands at `STATION_CAMERA_PANEL_HEIGHT_CLASS`,
 * so adding this header did not push the tape's focus item off its pixel. The
 * stage takes what is left (`flex-1 min-h-0`).
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { ChevronUp } from '@/components/Icons';
import { MOBILE_SCAN_WINDOW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { STATION_EYEBROW_CLASS } from './station-chrome';
import {
  STATION_CAMERA_HEADER_HEIGHT_CLASS,
  STATION_CAMERA_PANEL_HEIGHT_CLASS,
} from './station-metrics';

export function MobileCameraPanel({
  /** Accessible name for the panel and its collapsed bar. */
  label,
  /** What the collapsed bar says. A verb — it is the control, not a caption. */
  collapsedLabel,
  /**
   * The middle slot: what is happening right now. A count or a short state
   * ("2 in flight", "Camera off"), never prose. The slot holds its width even
   * when empty so the two controls beside it never shift.
   */
  status,
  /** Renders `status` in the danger ink. */
  statusAlert = false,
  /** Open = the panel is up and the station's lens is running. */
  open,
  onOpenChange,
  /**
   * The left slot. The station's own control — the keyed-label fallback, and
   * its cancel while that field is up. One slot, one place, both modes.
   */
  leading,
  /** Right slot label. `Done` unless a station has a better word for leaving. */
  doneLabel = 'Done',
  /**
   * Collapse the stage to its content instead of standing at full height.
   * The keyed-entry mode wants this: a short bar flush under the tape rather
   * than a tall empty stage above a text field.
   */
  fitContent = false,
  /** Ground behind the stage. A lens wants the dark stage; a form does not. */
  stageClass = 'bg-stage',
  children,
}: {
  label: string;
  collapsedLabel: string;
  status?: string;
  statusAlert?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leading?: React.ReactNode;
  doneLabel?: string;
  fitContent?: boolean;
  stageClass?: string;
  children?: React.ReactNode;
}) {
  const panelId = useId();

  // Held in a ref so the Escape listener does not resubscribe on every render
  // of a parent that passes an inline handler.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const done = useCallback(() => onOpenChangeRef.current(false), []);
  const arm = useCallback(() => onOpenChangeRef.current(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, done]);

  if (!open) {
    return (
      // The primary CTA of the whole screen while the camera is away — so it is
      // painted as one. `success` is the house emerald, the same green it gives
      // a SERIAL (`CHIP_TONES.serial`), because on a floor station green is the
      // colour of a good read; blue is navigation and this is not navigation.
      // The fill map owns those literals — a hand-rolled <button> retyping them
      // is how one surface ends up a different green from the rest.
      //
      // `lg` + `min-h-11` is the `cta` rung of MOBILE_CONTROL_LADDER: 44px, the
      // one place paint equals hit because this IS the screen's primary action.
      <Button
        variant="success"
        size="lg"
        radius="flush"
        onClick={arm}
        aria-expanded={false}
        aria-controls={panelId}
        icon={<ChevronUp aria-hidden />}
        className="min-h-11 w-full shrink-0"
      >
        <span className={cn('text-role-caption', STATION_EYEBROW_CLASS)}>
          {collapsedLabel}
        </span>
      </Button>
    );
  }

  return (
    <section
      id={panelId}
      aria-label={label}
      className={cn(
        MOBILE_SCAN_WINDOW_CORNER,
        'flex shrink-0 flex-col overflow-hidden',
        fitContent ? 'h-auto' : STATION_CAMERA_PANEL_HEIGHT_CLASS,
      )}
    >
      {/*
        The panel's one row of chrome, on its OWN ground rather than over the
        picture. `border-t` is the lip: it is what the tape above meets, now
        that there is no grab bar drawing that edge for us.

        Three slots, fixed: leading · status · Done. The middle one is
        `flex-1 min-w-0 truncate` so a long state line shortens itself instead
        of pushing Done off its corner.
      */}
      <header
        className={cn(
          'flex shrink-0 items-center gap-2 border-t border-border-default bg-surface-card px-2',
          STATION_CAMERA_HEADER_HEIGHT_CLASS,
        )}
      >
        <div className="flex shrink-0 items-center">{leading}</div>

        <span
          role="status"
          className={cn(
            'min-w-0 flex-1 truncate text-center text-role-eyebrow tabular-nums',
            STATION_EYEBROW_CLASS,
            statusAlert ? 'text-text-danger' : 'text-text-muted',
          )}
        >
          {status ?? ''}
        </span>

        {/*
          The labelled way out — what the drag gesture and the grab bar used to
          be. `sm` paints 32px and the pseudo-element carries the rest of the
          44px hit region (32 + 6 + 6), the paint-small-hit-big rule of
          MOBILE_CONTROL_LADDER.
        */}
        <Button
          variant="ghost"
          size="sm"
          radius="flush"
          onClick={done}
          aria-expanded
          aria-controls={panelId}
          className="relative shrink-0 before:absolute before:-inset-1.5 before:content-['']"
        >
          {doneLabel}
        </Button>
      </header>

      <div
        className={cn(
          'relative overflow-hidden',
          fitContent ? 'shrink-0' : 'min-h-0 flex-1',
          stageClass,
        )}
      >
        {children}
      </div>
    </section>
  );
}
