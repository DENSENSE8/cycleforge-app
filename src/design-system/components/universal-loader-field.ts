/** Pure field math for {@link UniversalLoader} — no React, no DOM, no motion. */

import { baseColors } from '@/design-system/tokens/colors';

/** Idle dot radius, in CSS px. Fine grain: the field is chrome, not texture. */
export const BASE_RADIUS = 0.75;

/** Idle dot opacity. */
export const IDLE_ALPHA = 0.8;

export type RGB = readonly [number, number, number];

/** One dot's colour pair: its resting pastel and the saturated peak it reaches. */
export interface PastelStop {
  readonly name: string;
  readonly idle: RGB;
  readonly active: RGB;
}

function rgb(hex: string): RGB {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as RGB;
}

/** Composite an RGB over white at {@link IDLE_ALPHA} and return its luminance. */
export function luminanceOnWhite(c: RGB): number {
  const [r, g, b] = c.map((ch) => IDLE_ALPHA * ch + (1 - IDLE_ALPHA) * 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The band every resting pastel must land in, as composited over white. */
export const READABLE_LUMINANCE = { min: 175, max: 218 } as const;

type Family = 'blue' | 'purple' | 'emerald' | 'orange' | 'red' | 'navy' | 'green' | 'yellow';

/** One palette entry: */
function stop(name: Family, idleStep: 300 | 400): PastelStop {
  const scale = baseColors[name] as Record<number, string>;
  return { name, idle: rgb(scale[idleStep]), active: rgb(scale[idleStep + 200]) };
}

/** The field's palette: */
export const PASTEL_PALETTE: readonly PastelStop[] = [
  stop('blue', 300),
  stop('purple', 300),
  stop('emerald', 300),
  stop('orange', 300),
  stop('red', 300),
  stop('navy', 300),
  stop('green', 400),
  stop('yellow', 400),
] as const;

/** Which pastel a lattice cell wears — a spatial hash, deliberately NOT linear. */
export function pastelFor(col: number, row: number): PastelStop {
  // Two large primes — the standard spatial hash. `| 0` keeps it in int32 so
  // the result is stable rather than drifting once the grid gets large.
  const h = ((col * 73856093) ^ (row * 19349663)) | 0;
  return PASTEL_PALETTE[Math.abs(h) % PASTEL_PALETTE.length];
}

/** Dot alpha at a given interaction intensity (0 = idle, 1 = full). */
export function dotAlpha(intensity: number): number {
  return IDLE_ALPHA + intensity * (1 - IDLE_ALPHA);
}

/** A dot's fill: its own pastel at rest, its own deeper sibling at intensity. */
export function dotFill(stop: PastelStop, intensity: number): string {
  const { idle, active } = stop;
  if (intensity <= 0) {
    return `rgba(${idle[0]}, ${idle[1]}, ${idle[2]}, ${IDLE_ALPHA})`;
  }
  const [r, g, b] = [0, 1, 2].map((i) =>
    Math.round(idle[i] + (active[i] - idle[i]) * intensity),
  );
  return `rgba(${r}, ${g}, ${b}, ${dotAlpha(intensity)})`;
}

/** The JS-free twin of the canvas lattice — present in the server HTML so the field is not blank before hydration (see the pre-hydration… */
export function latticeStyle(spacing: number): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
} {
  const tile = spacing * 2;
  // Sample ACROSS the palette rather than taking the first four, so the
  // pre-hydration lattice previews the field's real spread and the handoff to
  // the canvas is not a widening of the range.
  const step = Math.max(1, Math.floor(PASTEL_PALETTE.length / 4));
  const stops = [0, 1, 2, 3].map((i) => PASTEL_PALETTE[(i * step) % PASTEL_PALETTE.length]);
  const dot = (c: RGB) =>
    `radial-gradient(circle, rgba(${c[0]}, ${c[1]}, ${c[2]}, ${IDLE_ALPHA}) ${BASE_RADIUS}px, transparent ${BASE_RADIUS + 0.5}px)`;
  return {
    backgroundImage: stops.map((s) => dot(s.idle)).join(', '),
    backgroundSize: `${tile}px ${tile}px`,
    backgroundPosition: `0 0, ${spacing}px 0, 0 ${spacing}px, ${spacing}px ${spacing}px`,
  };
}
