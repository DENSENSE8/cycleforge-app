'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import SignaturePadLib, { type PointGroup } from 'signature_pad';
import { Button, IconButton } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Maximize2, X } from '@/components/Icons';
import {
  REPAIR_SIGNATURE_GUIDE_CLASS,
  REPAIR_SIGNATURE_PAD_CLASS,
} from '@/lib/repair/signature-geometry';
import { exportSignaturePng, scaleSignatureCanvas } from './signature-canvas';
import { cn } from '@/utils/_cn';

export interface SignatureData {
  strokes: PointGroup[];
  dataUrl: string;
}

interface SignaturePadProps {
  onSignatureChange: (data: SignatureData | null) => void;
  label?: string;
  /**
   * Legacy STAFF fill: the pad's box takes its parent's height instead of its
   * own aspect ({@link REPAIR_SIGNATURE_PAD_CLASS}). Kept for the two staff mounts
   * that size the pad from a fixed-height wrapper (`RepairIntakeForm`,
   * `RepairPickupFlow`) so the 2026-09-15 kiosk geometry change does not
   * relayout surfaces it was not about.
   *
   * It is NOT an escape from the print law: the export is cropped to the ink
   * either way (`exportSignaturePng`), which is what actually seats the
   * signature on the ruled line. This prop only decides the on-screen box.
   *
   * Ignored while `expanded` — see the Dialog below.
   */
  fillHeight?: boolean;
  /** `dropoff` — square corners, matches printed drop-off signature line. */
  variant?: 'default' | 'dropoff';
  /**
   * Show a control that expands the pad to a full-viewport Dialog so a
   * customer can sign on a tablet (kiosk-shell: intentional signature focus).
   */
  allowFullscreen?: boolean;
}

export function SignaturePad({
  onSignatureChange,
  label = 'Customer Signature',
  fillHeight,
  variant = 'default',
  allowFullscreen = false,
}: SignaturePadProps) {
  const padRef = useRef<SignaturePadLib | null>(null);
  /** Survives fullscreen remount (Dialog portal) so strokes restore after expand/collapse. */
  const strokesRef = useRef<PointGroup[]>([]);
  const [signed, setSigned] = useState(false);
  const [expanded, setExpanded] = useState(false);

  /**
   * The pad binds to the CANVAS NODE, not to `expanded`.
   *
   * `expanded` is only a proxy for "a canvas exists", and in the fullscreen
   * branch it is a WRONG one: `@radix-ui/react-portal` renders `null` on its
   * first render and mounts its children from a layout effect
   * (`useLayoutEffect(() => setMounted(true), [])`). So the commit that flips
   * `expanded` unmounts the inline canvas and mounts nothing — an effect keyed
   * on `[expanded]` runs against a null ref, bails, and never runs again
   * because `expanded` does not change when the portal's second commit finally
   * attaches the canvas. The result was a fullscreen pad with no `signature_pad`
   * bound to it: no ink, a dead Clear, and no stroke restore.
   *
   * Element state + stable callback refs fire exactly on attach/detach, so the
   * pad follows the canvas across both commits and across either branch.
   * `useCallback` identity is load-bearing — an inline `ref={(n) => …}` is a
   * new function every render, which detaches and re-attaches on every render
   * and would tear the pad down mid-signature.
   */
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => setCanvasEl(node), []);
  const containerRef = useCallback((node: HTMLDivElement | null) => setContainerEl(node), []);

  /**
   * The live callback, so the pad effect never has to list it as a dependency
   * — a caller passing an inline arrow would otherwise rebuild the pad on
   * every parent render and drop the strokes in progress.
   */
  const onChangeRef = useRef(onSignatureChange);
  useEffect(() => {
    onChangeRef.current = onSignatureChange;
  });

  // Initialize signature_pad + ResizeObserver. Keyed on the NODES, so this runs
  // on whichever commit actually attaches the canvas — inline or portal.
  useEffect(() => {
    const canvas = canvasEl;
    const container = containerEl;
    if (!canvas || !container) return;

    let pad: SignaturePadLib | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;

    const emitFromPad = (next: SignaturePadLib) => {
      const data = next.toData();
      const totalPoints = data.reduce((sum, group) => sum + group.points.length, 0);
      if (data.length >= 1 && totalPoints >= 5) {
        strokesRef.current = data;
        setSigned(true);
        onChangeRef.current({
          strokes: data,
          dataUrl: exportSignaturePng(canvas, data, () => next.toDataURL('image/png')),
        });
      } else {
        strokesRef.current = [];
        setSigned(false);
        onChangeRef.current(null);
      }
    };

    const initPad = () => {
      if (pad) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;

      scaleSignatureCanvas(canvas);

      pad = new SignaturePadLib(canvas, {
        minWidth: 0.5,
        maxWidth: 2.5,
        penColor: 'black',
        velocityFilterWeight: 0.7,
      });
      padRef.current = pad;

      if (strokesRef.current.length > 0) {
        pad.fromData(strokesRef.current);
        setSigned(true);
      }

      pad.addEventListener('endStroke', () => {
        if (!pad) return;
        emitFromPad(pad);
      });
    };

    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!pad) {
          initPad();
          return;
        }
        const strokeData = pad.toData();
        scaleSignatureCanvas(canvas);
        pad.clear();
        if (strokeData.length > 0) {
          pad.fromData(strokeData);
          // Re-export at the new size. Without this the stored data URL stayed
          // the pre-resize crop, so expanding to fullscreen and collapsing
          // again saved a PNG that no longer matched the pad on screen.
          emitFromPad(pad);
        }
      }, 50);
    });
    ro.observe(container);
    initPad();

    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
      // The strokes themselves live in `strokesRef` (written on every
      // `endStroke`), so tearing the pad down to follow the canvas into the
      // Dialog never loses ink — `initPad` restores it on the other side.
      if (pad) pad.off();
      padRef.current = null;
    };
  }, [canvasEl, containerEl]);

  const handleClear = useCallback(() => {
    padRef.current?.clear();
    strokesRef.current = [];
    setSigned(false);
    onChangeRef.current(null);
  }, []);

  const isDropoff = variant === 'dropoff';
  /**
   * The legacy staff fill, DELIBERATELY not extended to fullscreen.
   *
   * `expanded` used to set this too, which is how the Dialog produced a
   * viewport-tall canvas — the same dead-space defect as the old 200px pad,
   * one altitude up. Fullscreen now takes the aspect law like every other
   * kiosk mount; only the two fixed-height staff wrappers still fill.
   */
  const fill = Boolean(fillHeight) && !expanded;

  const labelRow = (
    <div className="flex items-center justify-between gap-3">
      <label
        className={`block uppercase tracking-[0.15em] text-text-soft ${
          isDropoff || expanded ? 'text-role-micro' : 'text-role-eyebrow'
        }`}
      >
        {label}
      </label>
      <div className="flex items-center gap-2 sm:gap-3">
        <span
          className={`flex items-center gap-1.5 border uppercase tracking-wide transition-opacity ${
            isDropoff || expanded ? 'rounded-none px-2 py-1 text-role-micro' : 'px-2 py-1 text-role-eyebrow'
          } ${signed ? 'border-border-soft bg-surface-sunken text-text-default' : 'border-transparent opacity-0'}`}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Signed
        </span>
        {allowFullscreen && !expanded && (
          <HoverTooltip label="Sign full screen" asChild>
            <IconButton
              size="md"
              icon={<Maximize2 className="h-4 w-4" />}
              onClick={() => setExpanded(true)}
              ariaLabel="Sign full screen"
              className="rounded-lg border border-border-soft text-text-soft hover:border-border-strong hover:text-text-default"
            />
          </HoverTooltip>
        )}
        <Button
          variant="ghost"
          type="button"
          onClick={handleClear}
          className={`h-auto rounded px-2 py-1 uppercase tracking-wide text-red-500 hover:bg-red-50 hover:text-red-700 ${
            isDropoff || expanded ? 'text-role-micro' : 'text-role-eyebrow'
          }`}
        >
          Clear
        </Button>
        {expanded && (
          <HoverTooltip label="Close full screen" asChild>
            <IconButton
              size="md"
              icon={<X className="h-4 w-4" />}
              onClick={() => setExpanded(false)}
              ariaLabel="Close full screen"
              className="rounded-lg border border-border-soft text-text-soft hover:border-border-strong hover:text-text-default"
            />
          </HoverTooltip>
        )}
      </div>
    </div>
  );

  /**
   * The pad box. On the kiosk its geometry is a RATIO on the kiosk axis
   * ({@link REPAIR_SIGNATURE_PAD_CLASS}), never a fixed height: it is mounted at
   * four measures and a height means a different aspect at each one. The
   * `fill` branch is the staff wrappers' own height (see {@link fill}); the
   * border follows it because a filled pad is already inside a bordered box.
   */
  const canvasArea = (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-surface-card',
        fill ? 'min-h-0 flex-1' : cn('border border-border-default', REPAIR_SIGNATURE_PAD_CLASS),
      )}
    >
      {/* `touch-none` is load-bearing, not styling: without it a finger drag
          scrolls the pane instead of drawing. `select-none` emits the
          -webkit- prefix iOS needs. */}
      <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />
      <div className={REPAIR_SIGNATURE_GUIDE_CLASS} />
      {!signed && (
        <span className="pointer-events-none absolute right-3 top-3 text-role-micro uppercase tracking-wide text-text-faint">
          Touch to sign
        </span>
      )}
    </div>
  );

  return (
    <>
      {!expanded && (
        <div className={fillHeight ? 'flex h-full flex-col gap-2 px-3 pt-3' : 'space-y-2'}>
          {labelRow}
          {canvasArea}
        </div>
      )}

      {allowFullscreen && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent
            hideClose
            overlayClassName="bg-surface-canvas"
            className="fixed inset-0 left-0 top-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-none border-0 bg-surface-canvas p-5 shadow-none sm:p-8"
          >
            <DialogTitle className="sr-only">{label}</DialogTitle>
            <DialogDescription className="sr-only">
              Sign with your finger or stylus. Press Done when finished.
            </DialogDescription>
            {labelRow}
            {/*
              The pad keeps its aspect in fullscreen too. This used to be
              `min-h-0 flex-1`, i.e. a canvas as tall as the viewport — the tall
              dead space the operator reported, one altitude up.
            */}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {canvasArea}
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full shrink-0"
              onClick={() => setExpanded(false)}
            >
              {signed ? 'Done' : 'Close'}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
