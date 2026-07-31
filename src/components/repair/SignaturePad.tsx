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

export interface SignatureData {
  strokes: PointGroup[];
  dataUrl: string;
}

interface SignaturePadProps {
  onSignatureChange: (data: SignatureData | null) => void;
  label?: string;
  /** When true, the pad fills its parent height instead of using a fixed height */
  fillHeight?: boolean;
  /** `dropoff` — square corners, matches printed drop-off signature line. */
  variant?: 'default' | 'dropoff';
  /**
   * Show a control that expands the pad to a full-viewport Dialog so a
   * customer can sign on a tablet (kiosk-shell: intentional signature focus).
   */
  allowFullscreen?: boolean;
}

const PAD_HEIGHT = 200;

/**
 * Scale canvas for Retina/HiDPI displays so strokes are crisp on iPad.
 * Sets the internal resolution to match devicePixelRatio while keeping
 * the CSS display size at the container's dimensions.
 */
function scaleCanvas(canvas: HTMLCanvasElement) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(ratio, ratio);
}

export function SignaturePad({
  onSignatureChange,
  label = 'Customer Signature',
  fillHeight,
  variant = 'default',
  allowFullscreen = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Survives fullscreen remount (Dialog portal) so strokes restore after expand/collapse. */
  const strokesRef = useRef<PointGroup[]>([]);
  const [signed, setSigned] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Initialize signature_pad + ResizeObserver (re-binds when Dialog mounts the canvas).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let pad: SignaturePadLib | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;

    const emitFromPad = (next: SignaturePadLib) => {
      const data = next.toData();
      const totalPoints = data.reduce((sum, group) => sum + group.points.length, 0);
      if (data.length >= 1 && totalPoints >= 5) {
        strokesRef.current = data;
        setSigned(true);
        onSignatureChange({
          strokes: data,
          dataUrl: next.toDataURL('image/png'),
        });
      } else {
        strokesRef.current = [];
        setSigned(false);
        onSignatureChange(null);
      }
    };

    const initPad = () => {
      if (pad) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;

      scaleCanvas(canvas);

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
        scaleCanvas(canvas);
        pad.clear();
        if (strokeData.length > 0) pad.fromData(strokeData);
      }, 50);
    });
    ro.observe(container);
    initPad();

    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
      if (pad) pad.off();
      padRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const handleClear = useCallback(() => {
    padRef.current?.clear();
    strokesRef.current = [];
    setSigned(false);
    onSignatureChange(null);
  }, [onSignatureChange]);

  const isDropoff = variant === 'dropoff';
  const fill = Boolean(fillHeight || expanded);

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

  const canvasArea = (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-surface-card ${
        fill ? 'min-h-0 flex-1' : 'border border-border-default'
      }`}
      style={fill ? undefined : { height: PAD_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />
      <div className="pointer-events-none absolute bottom-10 left-6 right-6 border-b-2 border-dashed border-border-soft" />
      <span className="pointer-events-none absolute bottom-3 left-6 text-role-micro uppercase tracking-[0.2em] text-text-faint">
        Sign above
      </span>
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
            {canvasArea}
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
