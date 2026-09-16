'use client';

/**
 * The bottom CAMERA PANEL every mobile scan kernel mounts.
 *
 * This is the SoT chrome for "a lens is open on this phone". `MobileCaptureWindow`
 * owns the lens; this file owns the box it sits in and the one row of controls
 * that floats on it. A station supplies content, a label, a status line and a
 * leading control — nothing here knows what a barcode is.
 *
 * ## It is a PANEL, not a sheet (operator 2026-09-11)
 *
 * It used to be `MobileStationSheet`: draggable, with a grab bar, dismissed by
 * throwing it downward. That is modal-ish furniture on the one surface that is
 * never furniture — the camera IS the screen's job, so a gesture whose only
 * outcome is "make the job go away" is a way to lose the lens by accident while
 * holding a box. The dismiss is now a labelled control, and nothing drags.
 *
 * ## The header is GLASS ON THE FEED, not a band above it (operator 2026-09-11)
 *
 * First pass put the row on its own opaque ground above the picture, plus a 2px
 * lane above that for pending work. Both were wrong for the same reason: every
 * word in that row is ABOUT the camera — what the lens is doing, how many of its
 * reads are still settling, and how to leave it — so a band outside the
 * viewfinder reads as page chrome that merely happens to sit nearby, and the
 * operator's eye has to leave the picture to collect it. Two stacked strips also
 * ate 38px of the panel's fixed height, which is 38px of lens.
 *
 * So the row floats ON the image as one blurred bar, pinned to the top of the
 * stage, and the picture runs edge to edge behind it:
 *
 *   ┌──────────────────────────────────────┐
 *   │▒[T]▒▒▒▒▒▒▒2 pending▒▒▒▒▒▒▒▒▒[Done]▒▒│  ← glass, 36px, ON the feed
 *   │                                      │
 *   │            live camera               │
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * Left is the station's leading control (the keyed-label fallback, or its cancel
 * while typing). Middle is what is happening RIGHT NOW. Right is Done. The slots
 * never move between states, so the thumb and eye learn one geometry.
 *
 * The bar earns its pixels the way a camera app's does: `Button variant="glass"`
 * / `IconButton tone="glass"` — a dark scrim plus `backdrop-blur`, because the
 * ground underneath is a moving image and, on a dock, usually a WHITE shipping
 * label that swallows white ink outright.
 *
 * ONE bar, and that is the entire chrome budget for this surface. No corner
 * reticle, no sweep line, no second pill in another corner (each of those was
 * here at some point). Anything a station wants to say goes through the three
 * slots or through the tape above the panel.
 *
 * ## Pending work is the bar's own tint, not an extra line
 *
 * While the server has not answered a scan, the glass carries a breathing accent
 * wash (`cf-scan-pending`, opacity-only, `--cf-motion-status`). Motion is bounded
 * by a real event — it starts on a commit, stops when the queue empties, and the
 * STOPPING is the information. The count stays in the middle slot, so the number
 * is still reachable by AT and motion is never the sole channel.
 *
 * ## Done, and the way back
 *
 * Done stops the lens and collapses the panel to a full-width 44px CTA that
 * brings it back. That is a disclosure, not a sheet: no scrim, no focus trap, no
 * portal, no drag, and the tape stays live and readable the whole time. `Escape`
 * is Done's keyboard twin.
 *
 * ## Height
 *
 * The panel stands at `STATION_CAMERA_PANEL_HEIGHT_CLASS` and the stage is now
 * the WHOLE of it, because the bar floats instead of stacking. The tape's focus
 * item keeps the pixel it has always held.
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
   * The middle slot. A COUNT or a two-word state ("14 in", "Offline"), never a
   * sentence: this is 11px caps on a 36px bar, read by someone whose eyes are
   * on the box.
   */
  status,
  /** Renders `status` in the alert ink, and tints the glass. */
  statusAlert = false,
  /**
   * How many scans the server has not answered yet.
   *
   * `> 0` breathes the bar's accent wash; `0` leaves the glass plain. The
   * NUMBER still reaches the operator through `status` — motion never carries
   * it alone.
   */
  pending = 0,
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
   * The stage holds a FORM, not a lens: collapse it to content height and put
   * the bar back on an opaque ground above it.
   *
   * Typing is the one state with no picture to float on — glass over a white
   * text field is just illegible ink — so the bar keeps its geometry and swaps
   * its ground. Nothing moves; the slots stay where the thumb left them.
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
  pending?: number;
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

  /**
   * The bar, in both of its grounds.
   *
   * Over the lens it is `absolute` glass; over the typed field it is an in-flow
   * opaque row. Same three slots, same order, same height — one definition, so
   * the two faces cannot drift apart.
   */
  const bar = (
    <div
      className={cn(
        'z-20 flex shrink-0 items-center gap-2 px-2',
        STATION_CAMERA_HEADER_HEIGHT_CLASS,
        fitContent
          ? 'bg-surface-card'
          : // 55% is not taste: the ground behind this bar is, on a dock, a
            // WHITE shipping label, and white ink needs that much dark glass
            // to clear a contrast floor against it. The blur is what makes it
            // read as one surface rather than a dimmed rectangle.
            'absolute inset-x-0 top-0 bg-scrim/55 backdrop-blur-md',
      )}
    >
      {/*
        Pending work, as the bar's OWN tint.
        
        An accent wash under the text, breathing on opacity only — never a
        separate strip, and never the bar's `background-color` (that is a paint
        property, and it would fight the scrim the ink depends on). `data-motion`
        is stamped HERE, so the heartbeat is licensed without licensing status
        motion for anything else in the station (LAWS §M).
      */}
      {pending > 0 && !statusAlert && (
        <span
          aria-hidden
          data-motion="2"
          className="cf-scan-pending-wash pointer-events-none absolute inset-0 bg-fill-info/35"
        />
      )}
      {statusAlert && (
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-fill-danger/30" />
      )}

      <div className="relative flex shrink-0 items-center">{leading}</div>

      <span
        role="status"
        className={cn(
          'relative min-w-0 flex-1 truncate text-center text-role-eyebrow tabular-nums',
          STATION_EYEBROW_CLASS,
          fitContent
            ? statusAlert
              ? 'text-text-danger'
              : 'text-text-muted'
            : // On glass the ink is white by necessity — the ground is whatever
              // the lens is pointed at. Alert stays legible as rose-200, the
              // same on-scrim danger ink the dead-lens overlay uses.
              statusAlert
              ? 'text-rose-200'
              : 'text-white/85',
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
        variant={fitContent ? 'ghost' : 'glass'}
        size="sm"
        radius="flush"
        onClick={done}
        aria-expanded
        aria-controls={panelId}
        className="relative shrink-0 before:absolute before:-inset-1.5 before:content-['']"
      >
        {doneLabel}
      </Button>
    </div>
  );

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
      {fitContent && bar}

      <div
        className={cn(
          'relative overflow-hidden',
          fitContent ? 'shrink-0' : 'min-h-0 flex-1',
          stageClass,
        )}
      >
        {children}
        {!fitContent && bar}
      </div>
    </section>
  );
}
