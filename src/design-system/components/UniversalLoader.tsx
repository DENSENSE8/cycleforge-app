'use client';

/**
 * `UniversalLoader` — the house loading field that replaces per-surface skeletons.
 *
 * @domain-job        Cover a work plane while its data is in flight.
 * @hardware-target   Station · Workbench · Monitor
 * @density           floor
 * @justification     The skeleton family it replaces was one hand-drawn twin per
 *                    surface (`UnboxWorkbenchSkeleton`, `UnboxStationFirstPaint`,
 *                    `ReceivingWorkspaceSkeleton`, …), each of which had to be
 *                    re-drawn every time its real chrome moved — and each of
 *                    which drifted anyway. One field over the real anatomy has
 *                    no geometry to keep in sync.
 *
 * ## Why a canvas and not a grid of divs
 *
 * The field is ~2.5k dots at desk width. As DOM nodes that is 2.5k layout boxes
 * mutated every frame; as one canvas it is a single composited surface, so the
 * spring integration stays off the main-thread layout path entirely.
 *
 * ## What it paints
 *
 * - **Anti-gravity** — dots inside `MOUSE_RADIUS` of the pointer are pushed
 *   along the outbound vector and spring back (`SPRING` / `FRICTION`) once it
 *   leaves. Pointer position comes from a **window** listener, not a canvas one,
 *   so the effect survives `pointer-events-none` (the default here: an operator
 *   must be able to reach the surface underneath while it settles).
 * - **Scaled refresh** — one DIAGONAL band whose dots swell on a sine, timed
 *   off `performance.now()` so its speed is frame-rate independent. The front
 *   is the line `x + y = c`, so it enters at the top-LEFT corner and its
 *   crossing of the top edge travels to the top-RIGHT corner before the tail
 *   clears the bottom. A plain vertical band read as a shutter; the diagonal
 *   reads as a pass over the plane.
 * - **Light unmount** — `isLoading` going false fades the overlay over
 *   `motionDurations.slow`, THEN unmounts, so the rAF loop stops rather than
 *   idling behind an invisible layer.
 *
 * ## The pre-hydration lattice (do not delete)
 *
 * A canvas draws nothing until its effect runs, and on a Tier-1 route that is
 * the whole window the cover exists for — measured on `/unbox`, the effect
 * fires well over half a second after the overlay is in the DOM, so the plane
 * sat blank for exactly as long as the operator was waiting. The overlay
 * therefore carries the SAME lattice as a CSS `radial-gradient` background:
 * same pitch, same token, zero JS, present in the server HTML. The canvas
 * clears it (`fieldLive`) the moment it has painted its first frame, so the
 * dots are never drawn twice.
 *
 * ## One field per covered region — it refuses to nest
 *
 * Unbox stacks three of these over the same plane: the browse shell's cover,
 * the `ReceivingLineWorkspace` chunk fallback inside it, and the desk view's.
 * As skeletons that was three static markup trees; as canvases it would be
 * three rAF loops integrating springs over the same pixels, and three
 * overlapping dot fields reading as one darker, denser field. A descendant
 * therefore checks {@link FieldCoverContext} and paints nothing while an
 * ancestor already covers it — the ancestor's field IS its loading face. If
 * the ancestor settles first, the descendant takes over on the next render.
 *
 * ## House constraints this obeys
 *
 * - **Color comes from theme tokens, never a literal.** The two dot colors are
 *   read from `--ds-color-text-faint` / `--ds-color-accent-bg` on the document
 *   element and re-read when `data-theme` or the accent class changes — a canvas
 *   cannot inherit a Tailwind class, so this is the token path for 2D context.
 * - **Reduced motion paints ONE static frame** — no loop, no pointer listener.
 *   This is also the honest reading of the Unbox ruling that a pulsing skeleton
 *   "reads as a fault light" on a scan floor: the operator who has asked the OS
 *   for stillness gets stillness.
 * - **Hidden tabs stop the loop** (`visibilitychange`), so a backgrounded desk
 *   costs nothing.
 * - Flush ops chrome: the overlay inherits its host's radius, it never adds one.
 *
 * ## Usage
 *
 * ```tsx
 * <UniversalLoader isLoading={!ready}>
 *   <TheRealSurface />
 * </UniversalLoader>
 * ```
 *
 * Children stay mounted and keep defining layout, so the swap costs no shift
 * (CLS 0). With no children it is a standalone field — the shape a Suspense
 * `fallback` or a `loading.tsx` wants.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { motionDurations } from '@/design-system/foundations/motion';
import { useReducedMotion } from '@/design-system/motion';
import {
  BASE_RADIUS,
  FALLBACK_ACTIVE,
  FALLBACK_IDLE,
  dotFill,
  latticeStyle,
  parseCssColor,
  type RGB,
} from './universal-loader-field';
import { cn } from '@/utils/_cn';

/** True inside a region an ancestor field is already covering. */
const FieldCoverContext = createContext(false);

/**
 * Declare a region already covered — every {@link UniversalLoader} inside it
 * paints nothing and runs no loop.
 *
 * The ancestor guard inside the loader handles real nesting on its own. This is
 * for the case it cannot see: a host that keeps a pane MOUNTED but hidden
 * (`visibility: hidden` + `inert`) behind a sibling overlay. Unbox does exactly
 * that on carton→carton, and the hidden pane's own chunk fallback was happily
 * integrating springs into a canvas nobody could see.
 */
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
}

function readTokenColor(name: string, fallback: RGB): RGB {
  if (typeof window === 'undefined') return fallback;
  const resolved = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name);
  return parseCssColor(resolved, fallback);
}

export interface UniversalLoaderProps {
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

    let idle = readTokenColor('--ds-color-text-faint', FALLBACK_IDLE);
    let active = readTokenColor('--ds-color-accent-bg', FALLBACK_ACTIVE);

    const buildGrid = () => {
      dots = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const x = i * spacing;
          const y = j * spacing;
          dots.push({ originX: x, originY: y, x, y, vx: 0, vy: 0 });
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

        ctx.fillStyle = dotFill(idle, active, intensity);

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

    // A theme swap changes the resolved token values, not any class the canvas
    // could inherit — re-read them by hand when the document theme flips.
    const themeObserver = new MutationObserver(() => {
      idle = readTokenColor('--ds-color-text-faint', FALLBACK_IDLE);
      active = readTokenColor('--ds-color-accent-bg', FALLBACK_ACTIVE);
      if (reduceMotion) paint(0);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

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
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [showField, reduceMotion, spacing]);

  return (
    <FieldCoverContext.Provider value={coveredByAncestor || mounted}>
      <div
        ref={containerRef}
        className={cn('relative flex min-h-0 w-full flex-1 flex-col', className)}
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
              'absolute inset-0 z-0 overflow-hidden bg-surface-canvas transition-opacity',
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

