'use client';

/**
 * The bottom CAMERA PANEL every mobile scan kernel mounts.
 * ## It is a PANEL, not a sheet (operator 2026-09-11)
 * ## The header is GLASS ON THE FEED, not a band above it (operator 2026-09-11)
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
  /** How many scans the server has not answered yet. */
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
  /** The stage holds a FORM, not a lens: */
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
      // The primary CTA of the whole screen while the camera is away — so it is painted as one.
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

  /** The bar, in both of its grounds. */
  const bar = (
    <div
      className={cn(
        'z-20 flex shrink-0 items-center gap-2 px-2',
        STATION_CAMERA_HEADER_HEIGHT_CLASS,
        fitContent
          ? 'bg-surface-card'
          : // 55% is not taste:
            'absolute inset-x-0 top-0 bg-scrim/55 backdrop-blur-md',
      )}
    >
      {/* Pending work, as the bar's OWN tint. */}
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

      {/* The labelled way out — what the drag gesture and the grab bar used to be. */}
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
