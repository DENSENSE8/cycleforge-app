'use client';

/** `UniversalLoader` — the house loading field that replaces per-surface skeletons. */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { motionDurations } from '@/design-system/foundations/motion';
import { useReducedMotion } from '@/design-system/motion';
import {
  BASE_RADIUS,
  dotFill,
  latticeStyle,
  pastelFor,
  type PastelStop,
} from './universal-loader-field';
import { cn } from '@/utils/_cn';

/** True inside a region an ancestor field is already covering. */
const FieldCoverContext = createContext(false);

/** Declare a region already covered — every {@link UniversalLoader} inside it paints nothing and runs no loop. */
export function LoaderFieldCover({
  covered,
  children,
}: {
  covered: boolean;
  children: React.ReactNode;
}) {
  const inherited = useContext(FieldCoverContext);
  return (
    <FieldCoverContext.Provider value={inherited || covered}>
      {children}
    </FieldCoverContext.Provider>
  );
}

/** Fade window before the canvas unmounts — the `slow` motion token, in ms. */
const FADE_MS = Number.parseInt(motionDurations.slow, 10);
/**
 * The same token, as the CSS transition. Inline because Tailwind's duration
 * scale has no `slow` step — reaching for `duration-[320ms]` would fork the
 * number away from {@link FADE_MS} and let the unmount race the fade.
 */
const FADE_STYLE = { transitionDuration: motionDurations.slow } as const;

/** Grid pitch in CSS px. Ops density: dense enough to read as a field. */
const SPACING_PX = 16;
/** Pointer influence radius in CSS px. */
const MOUSE_RADIUS = 120;
/** Peak outbound displacement at the pointer. */
const MOUSE_PUSH_PX = 25;
/** Width of the refresh band, measured along the diagonal, in CSS px. */
const SWEEP_WIDTH = 260;
/**
 * One full corner-to-corner pass. Slow on purpose: this is ambient chrome an
 * operator waits behind, not a progress bar racing them. A fast pass reads as
 * urgency the surface has no basis to claim.
 */
const SWEEP_PERIOD_MS = 4000;
/** Spring pull toward the resting lattice, per frame. */
const SPRING = 0.15;
/** Velocity damping, per frame. */
const FRICTION = 0.8;


interface Dot {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Resolved once at grid build — the palette is static, so it never re-picks. */
  stop: PastelStop;
}

interface UniversalLoaderProps {
  /** While true the field covers the plane; false fades it out, then unmounts. */
  isLoading: boolean;
  /**
   * The real surface. Stays mounted and keeps owning layout, so the reveal is a
   * pure opacity change. Omit for a standalone field (Suspense fallback).
   */
  children?: React.ReactNode;
  /** Host classes — control the flex/height contract from the call site. */
  className?: string;
  /** Announced to assistive tech while the field is up. */
  label?: string;
  /**
   * Swallow pointer input over the covered plane. Default `false`: on a scan
   * floor the operator reaches the bench underneath while it settles, and the
   * anti-gravity field reads the pointer from `window` either way.
   */
  blockInteraction?: boolean;
  /** Grid pitch override in CSS px (ops default {@link SPACING_PX}). */
  spacing?: number;
  /** Paint-timing marker carried onto the overlay, e.g. `unbox:primary`. */
  paintSurface?: string;
  /** Test hook on the overlay. */
  'data-testid'?: string;
}

export function UniversalLoader({
  isLoading,
  children,
  className,
  label = 'Loading…',
  blockInteraction = false,
  spacing = SPACING_PX,
  paintSurface,
  'data-testid': testId,
}: UniversalLoaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();

  // Two states, not one: `mounted` owns the canvas's life, `visible` owns the
  // opacity. Collapsing them would snap the field away instead of fading it.
  const [mounted, setMounted] = useState(isLoading);
  const [visible, setVisible] = useState(isLoading);
  /** True once the canvas has painted — until then the CSS lattice is the field. */
  const [fieldLive, setFieldLive] = useState(false);
  const coveredByAncestor = useContext(FieldCoverContext);
  /** Paint only when nothing above us already owns this region. */
  const showField = mounted && !coveredByAncestor;

  useEffect(() => {
    if (isLoading) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!showField || !canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let rect = canvas.getBoundingClientRect();
    const pointer = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };


    const buildGrid = () => {
      dots = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const x = i * spacing;
          const y = j * spacing;
          dots.push({
            originX: x,
            originY: y,
            x,
            y,
            vx: 0,
            vy: 0,
            stop: pastelFor(i, j),
          });
        }
      }
    };

    const resize = () => {
      width = container.offsetWidth;
      height = container.offsetHeight;
      if (width === 0 || height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // setTransform, not scale: `scale` COMPOUNDS across resizes and the grid
      // walks off-screen after the second one.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      rect = canvas.getBoundingClientRect();
      buildGrid();
    };

    const paint = (elapsedMs: number) => {
      ctx.clearRect(0, 0, width, height);

      // Frame-rate independent front position along the x+y diagonal. The span
      // is width+height, not width: the front has to clear the far corner.
      const progress = (elapsedMs % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
      const sweepFront =
        -SWEEP_WIDTH + progress * (width + height + SWEEP_WIDTH * 2);

      for (let i = 0; i < dots.length; i += 1) {
        const dot = dots[i];

        let mouseEffect = 0;
        if (!reduceMotion) {
          const dx = pointer.x - dot.originX;
          const dy = pointer.y - dot.originY;
          const distance = Math.hypot(dx, dy);

          let targetX = dot.originX;
          let targetY = dot.originY;
          // `distance > 0` guards the divide — a dot exactly under the pointer
          // would otherwise resolve to NaN and vanish for the rest of the run.
          if (distance > 0 && distance < MOUSE_RADIUS) {
            mouseEffect = 1 - distance / MOUSE_RADIUS;
            targetX -= (dx / distance) * mouseEffect * MOUSE_PUSH_PX;
            targetY -= (dy / distance) * mouseEffect * MOUSE_PUSH_PX;
          }

          dot.vx = (dot.vx + (targetX - dot.x) * SPRING) * FRICTION;
          dot.vy = (dot.vy + (targetY - dot.y) * SPRING) * FRICTION;
          dot.x += dot.vx;
          dot.y += dot.vy;
        }

        let sweepEffect = 0;
        if (!reduceMotion) {
          // Diagonal front: a dot's phase is how far it sits along x+y.
          const offset = sweepFront - (dot.originX + dot.originY);
          if (offset > 0 && offset < SWEEP_WIDTH) {
            sweepEffect = Math.sin((offset / SWEEP_WIDTH) * Math.PI);
          }
        }

        const intensity = Math.max(mouseEffect, sweepEffect);
        const radius = BASE_RADIUS + mouseEffect * 1.1 + sweepEffect * 0.9;

        ctx.fillStyle = dotFill(dot.stop, intensity);

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const start = performance.now();
    let handedOff = false;
    const loop = (now: number) => {
      paint(now - start);
      if (!handedOff) {
        handedOff = true;
        setFieldLive(true);
      }
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const run = () => {
      if (frame || reduceMotion) return;
      frame = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else run();
    };

    const onPointerMove = (event: PointerEvent) => {
      rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    if (reduceMotion) {
      paint(0);
      setFieldLive(true);
    } else {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      run();
    }

    return () => {
      setFieldLive(false);
      stop();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [showField, reduceMotion, spacing]);

  return (
    <FieldCoverContext.Provider value={coveredByAncestor || mounted}>
      <div
        ref={containerRef}
        className={cn(
          'relative flex w-full flex-1 flex-col',
          // A childless field has NOTHING in normal flow — the overlay is absolute, so it contributes no height.
          showField && !children ? 'min-h-24' : 'min-h-0',
          className,
        )}
      >
        {children ? (
          <div
            className={cn(
              'flex min-h-0 w-full flex-1 flex-col transition-opacity',
              visible && !coveredByAncestor && 'pointer-events-none opacity-0',
            )}
            style={FADE_STYLE}
            aria-hidden={(visible && !coveredByAncestor) || undefined}
            inert={(visible && !coveredByAncestor) || undefined}
          >
            {children}
          </div>
        ) : null}

        {showField ? (
          <div
            className={cn(
              // ds-allow-raw-neutral: loader field is pinned white in every theme (operator 2026-08-21)
              'absolute inset-0 z-0 overflow-hidden bg-white transition-opacity',
              visible ? 'opacity-100' : 'opacity-0',
              blockInteraction && visible ? 'pointer-events-auto' : 'pointer-events-none',
            )}
            style={fieldLive ? FADE_STYLE : { ...FADE_STYLE, ...latticeStyle(spacing) }}
            role="status"
            aria-busy="true"
            aria-label={label}
            data-paint-surface={paintSurface}
            data-testid={testId}
          >
            <span className="sr-only">{label}</span>
            <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
          </div>
        ) : null}
      </div>
    </FieldCoverContext.Provider>
  );
}

